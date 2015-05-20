/*
* timechart - simple plugin to create time charts.
*
*  Usage:
*
*   d3.select("#chart")
*     .call(d3.timechart(data)));
*
*  where data should look like:
*
* var data = {
*     times:[
*         {
*             domain:'https :// www.zunzun.se',
*             path:'/main.css',
*             http1: [0,1,6,7,14],  // [moment the request starts, sending, waiting, receiving, Total elapsed time of the request]
*             http2: [0,1,3,5,9]
*         },
*         {
*             domain:'https :// www.zunzun.se',
*             path:'/styles.css',
*             http1: [3,4,8,9,21],
*             http2: [5,4,5,6,15]
*         },
*         {
*             domain:'https :// www.zunzun.se',
*             path:'/scripts',
*             http1: [2,3,6,7,16],
*             http2: [1,3,5,9,17]
*         },
*         {
*             domain:'https :// www.zunzun.se',
*             path:'/routings.js',
*             http1: [6,1,1,2,4],
*             http2: [7,2,1,1,4]
*         }
*     ]
* };
*
* author: Zunzun AB - http://zunzun.se/
*/

d3.timechart = function (data) {

    var
        bar_height = 80, /* Height of each line */
        series_height = bar_height * 0.12, /* Height of each time series */
        major_series = ["http1", "http2"],
        major_serie_y = {"http1": bar_height * 0.33, "http2": bar_height*0.55},
        legend_height = 130, /* Height of the */
        five_seconds = (function (){
            var result = []; for (var i=0; i < 25; i++) { result.push(i*200);}
            return result;
        })(),
        timing_variables = ["blocked", "dns", "connect", "ssl", "send", "wait", "receive"],
        GRID_LINE_COLOR = "#dfdfdf",
        x_scale = null /* Populated later */
    ;

    function format_tooltip_text(amount){ return amount.toFixed(2) + 'ms';}

    function put_legend_in_diagram() {
        this.append("svg").attr("class", "legend");
        var legend = d3.select(".legend")
            .attr("width", vertical_separator + width)
            .attr("height", legend_height);
        var legend_series = legend.selectAll("g")
            .data(legend_data.series)
            .enter().append("g")
            .attr("transform", function (d, i) {
                return "translate(" + d.x + ",0)";
            }
        );
        legend_series.append("rect")
            .attr("class", function (d) {
                return d.class[0]
            })
            .attr("x", function (d) {
                return d.x;
            })
            .attr("y", function (d) {
                return d.y;
            })
            .attr("width", function (d) {
                return d.size;
            })
            .attr("height", series_height);
        legend_series.append("rect")
            .attr("class", function (d) {
                return d.class[1]
            })
            .attr("x", function (d) {
                return d.x + d.size;
            })
            .attr("y", function (d) {
                return d.y;
            })
            .attr("width", function (d) {
                return d.size;
            })
            .attr("height", series_height);
        legend_series.append("rect")
            .attr("class", function (d) {
                return d.class[2]
            })
            .attr("x", function (d) {
                return d.x + d.size + d.size;
            })
            .attr("y", function (d) {
                return d.y;
            })
            .attr("width", function (d) {
                return d.size;
            })
            .attr("height", series_height);

        legend_series.append("text")
            .attr("x", function (d) {
                return d.x + d.size + d.size + d.size + 40;
            })
            .attr("y", function (d) {
                return d.y + 8;
            })
            .text(function (d) {
                return d.text;
            });

        legend.selectAll("ag").data(legend_data.labels)
            .enter().append("text")
            .attr("x", function (d) {
                return d.x;
            })
            .attr("y", 10)
            .text(function (d) {
                return d.label;
            });

        legend.append("text")
            .attr("x", vertical_separator)
            .attr("y", 25)
            .text("Effectiveness: " + data.effectiveness);

        legend.append("text")
            .attr("x", total_width)
            .attr("y", 70)
            .text("Effectiveness = 1 - 2 * ( Max(R1,R2) - R1R2 ) / (R1 + R2)");

        legend.append("text")
            .attr("x", total_width)
            .attr("y", 85)
            .text("R1: number of HTTP/1.1 resources");

        legend.append("text")
            .attr("x", total_width)
            .attr("y", 100)
            .text("R2: number of HTTP/2 resources");

        legend.append("text")
            .attr("x", total_width)
            .attr("y", 115)
            .text("R1R2: number of common resources");
    }

    function put_rulers(selection){
        var top_diagram_zone = selection
            .append("div")
            .classed("top-diagram-zone", true)
        ;

        top_diagram_zone
            .append("div")
            .classed("label-zone-width", true)
        ;

        top_diagram_zone
            .append("div")
            .classed("timing-width h-ruler", true)
        ;
        d3
            .select(".h-ruler")
            .selectAll(".time-point")
            .data(five_seconds)
            .enter()
                .append("div")
                .classed("time-point", true)
                .text(function(d){ return String(d);})
        ;
    }

    function draw_vertical_grid(selection){

        var miniruler_div_container = selection
            .append("div")
            .classed("top-diagram-zone ruler-container", true)
        ;

        miniruler_div_container
            .append("div")
            .classed("label-zone-width", true)
        ;

        miniruler_div_container
            .append("div")
            .classed("timing-width vertical-grid", true)
        ;

        var div_vertical_grid = document.querySelector("div.vertical-grid");
        var parent_width = div_vertical_grid.offsetWidth;

        return draw_grid_using_canvas(parent_width);
        // Adopting SVG image generated by Neyvis'code
        //return draw_grid_using_svg(parent_width);
    }

    function draw_grid_using_canvas(parent_width)
    {
        var vertical_grid = d3.select(".vertical-grid");

        vertical_grid
            .append("canvas")
            .classed("grid-canvas", true)
        ;

        var vertical_grid_inner = vertical_grid
            .append("div")
            .classed("grid-container", true)
        ;

        // The canvas way.
        d3.select(".grid-canvas")
            .attr("width", parent_width)
            .style("width", parent_width + "px")
            .style("height", "5px")
            .classed("grid-canvas", true)
            .attr("height", "5")
        ;

        var cv = document.querySelector("canvas.grid-canvas");
        var ctx = cv.getContext("2d");
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = GRID_LINE_COLOR;
        five_seconds.forEach(function(value, index, arr){
            var x = Math.round( value * parent_width / 5000 );
            ctx.moveTo(x+0.5, 0);
            ctx.lineTo(x+0.5, 5);
            ctx.stroke();
        });
        var png_image = cv.toDataURL();
        vertical_grid_inner
            .style("background-image", "url(\'" + png_image + "\')")
            .style("background-repeat", "repeat-y")
        ;
    }

    function draw_grid_using_svg(parent_width)
    {

        d3.select(".vertical-grid")
            .append("svg")
            .classed("grid-svg", true)
        ;

        // The svg way.
        var grid_svg = d3.select(".grid-svg")
            .attr("width", parent_width)
            .attr("height", "5")
            .style("width", parent_width + "px")
            .style("height", "5px")
            .classed("grid-svg", true)
        ;

        grid_svg
            .selectAll("line")
            .data(five_seconds)
            .enter()
            .append("line")
            .style("stroke", GRID_LINE_COLOR)
            .style("stroke-width", 1.0)
            .attr("x1", function(d){
                    return Math.round(d * parent_width / 5000);
                })
            .attr("x2", function(d){
                    return Math.round( d * parent_width / 5000 );
                })
            .attr("y1", 0)
            .attr("y2", 5)

        var svg_image = "data:image/svg+xml;utf8," + encodeURIComponent(grid_svg[0][0].outerHTML);
        return svg_image;
    }

    function draw_single_serie(container_g, base_array, name, x_scale, use_y, ord)
    {
        if (base_array == null)
        {
            var lng = data.times.length;

            base_array = new Array(lng);
            for (var i=0; i < lng; i++) {
                base_array[i] = data.times[i][name[0]]["start_time"]
            }
        }
        var classes =
            "serie-" + name[0] + " " + "variable-" + name[1] ;

        var extract_from_d =
            function(d) { return Math.max( d[name[0]][name[1]], 0) ;};

        container_g.append("rect")
            .classed(classes, true)
            .attr("x", function(d, i) {
                var result = x_scale( base_array[i] );
                var visual_length = extract_from_d(d);
                base_array[i] += visual_length;
                return result;
            })
            .attr("y", use_y)
            .attr("width", function(d) {
                var visual_length = extract_from_d(d);
                return x_scale( visual_length );
            })
            .attr("height", series_height)
        ;

        return base_array;
    }

    function draw_ministrokes(container_g, base_array, name, x_scale, use_y, ord)
    {
        var major = name[0];
        var variable = name[1];
        var classes =
            "ministroke ministroke-" + major + " " + "ministroke-" + variable ;

        var go_up = major == "http1";


        container_g.append("path")
            .classed(classes, true)
            .attr("d", function(d, i) {
                var middle_time = (
                    base_array[i]
                    +
                    base_array[i+1]
                    )/2.;
                var middle_pos = x_scale( middle_time );

                // Adjust
                var scaling_parameters = scaling_for_major(d, major);

                var scaling_a = scaling_parameters[0],
                    scaling_b = scaling_parameters[1];

                var adjusted_middle_pos =
                    scaling_a * middle_pos + scaling_b;

                if ( ! go_up )
                {
                    use_y -= series_height;
                }

                // Create the path
                var path_def = "M " + adjusted_middle_pos + " " + use_y;
                if (go_up)
                {
                    path_def += " v -10";
                } else
                {
                    path_def += " v 10"
                }
                path_def += " L " + (ord*20);
                if (go_up)
                {
                    path_def += " 5 "
                } else
                {
                    path_def += " 55 ";
                }

                return path_def;
            })
        ;

        return base_array;
    }

    function draw_series(selection, x){
        for (var j=0; j < major_series.length; j++)
        {
            var base_array = null;
            var major = major_series[j];
            var major_class = major + "-g";
            // We put each major serie inside its own g element, so that we can
            // resize things easily.
            var major_container_selection = selection
                .append("g")
                .classed(major_class, true)
                ;
            for (var i=0; i < timing_variables.length; i++)
            {
                var minor = timing_variables[i];
                var name = [major, minor];
                base_array = draw_single_serie(
                    major_container_selection,
                    base_array,
                    name,
                    x,
                    major_serie_y[major],
                    i
                );
            }
            data.times.forEach(function(majors, i, arr){
                majors[major]["end_time"] = base_array[i];
            });

            // Now we draw the point-outs
            for (var i=0; i < timing_variables.length; i++)
            {
                var minor = timing_variables[i];
                var name = [major, minor];
                base_array = draw_ministrokes(
                    selection,
                    base_array,
                    name,
                    x,
                    major_serie_y[major],
                    i
                );
            }
        }
    }

    function draw_text()
    {
        d3.selectAll(".horiz-block")
            .data(data.times)
            .insert("div", ":first-child")
            .classed("left-text-block label-zone-width", true);
        var ltb = d3.selectAll(".left-text-block");
        ltb.append("div")
            .classed("text-domain", true)
            .text(function(d){
               return d.domain;
            });
        ltb.append("div")
            .classed("text-other", true)
            .text(function(d){
               return d.path;
            });

    }

    function draw(selection) {
        var div = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        var x = d3.scale.linear()
            .domain([0, 5000])
            .range([0, 100]);

        /* Save it for later */
        x_scale = x;

        put_rulers(selection);

        draw_vertical_grid(selection);

        selection.selectAll(".chart-timing-div")
            .data(data.times)
            .enter().append("div")
                .classed("horiz-block", true)
            ;

        d3.selectAll(".horiz-block")
            .append("div")
                .attr("class", "chart-timing-div timing-width")
        ;

        // Create a div that fills entirely the parent div
        var chart_timing_graphy = d3.selectAll(".chart-timing-div")
            .append("svg")
            .classed("chart-timing-graphy", true)
            .attr("width", "100%")
            .attr("height", bar_height + "px")
            .attr("viewBox", "0 0 100 " + bar_height )
            .attr("preserveAspectRatio", "none")
            ;

        var serie = chart_timing_graphy
            .append("g")
            .classed("outer-g", true)
            ;

        /* Create the series lines */
        serie
            .data(data.times)
            ;

        draw_series(serie, x);

        draw_text();

        install_event_handlers();

    }

    /* This is a simple object that contains a reference
    *  to the highlighted element */
    var interactions_register = {
        highlighted_element: null,
        highlighted_element_timeout: null
    };

    function install_event_handlers()
    {
        d3  .selectAll(".chart-timing-div")
            .on("mouseout", function(datum, i){
                maybe_smoothly_reset_size(datum, i);
            })
            .on("mousemove", function(datum,i){
                mouse_hovers_at_element(datum,i);
            })
            ;

        d3.selectAll(".http1-g rect")
            .on("mouseover", function(datum,i){
                smoothly_expand_element(datum,i, "http1", this);
            });

        d3.selectAll(".http2-g rect")
            .on("mouseover", function(datum,i){
                smoothly_expand_element(datum,i, "http2", this);
            });
    }

    /* The goal of this function is to act as an indirection
       layer when locating the element to transform
     */
    function scaling_target(el)
    {
        return el.parentElement;
    }

    function maybe_smoothly_reset_size(datum, i)
    {
        console.log("maybe_smoothly_reset_size called " + i);
    }

    function mouse_hovers_at_element(datum, i)
    {
        console.log("mouse_hovers_at_element " + i)
    }

    function scaling_for_major(datum, major) {
        var t0 = x_scale(datum[major]["start_time"]);
        var t1 = x_scale(datum[major]["end_time"]);
        var time_span = t1 - t0;
        var percent_span = 80; // <-- So let the scaled-up version
                               //     to use 80 percent of the horizontal space
        var scaling_a = percent_span / time_span;
        var scaling_b = (t1 * 10 - t0 * 90) / time_span;
        return [scaling_a, scaling_b];
    }

    function smoothly_expand_element(datum, i, major, el)
    {
        var t = scaling_target(el);
        var scaling_parameters = scaling_for_major(datum, major);
        var scaling_a=scaling_parameters[0], scaling_b=scaling_parameters[1];
        d3
            .select(t)
            .attr("transform", "matrix(" + scaling_a + ", 0, 0, 1, " + scaling_b + ", 0)");
    }

    // Here we return the draw object to the d3 framework, so that it can be instanced with
    // whatever data is needed.
    return draw;
}