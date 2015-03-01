'use strict';

/**
    * @ngdoc object
    * @name http2.controllers:analyzerController
    * @description
    *
    * Used for the index page.
**/

 angular.module('http2')
    .controller('analyzerController', ['$scope', 'analyzerService', function($scope, analyzerService){

         $scope.send = function() {
            /**
                 * @ngdoc method
                 * @name http2.controllers:analyzerController
                 * @methodOf http2.controllers:analyzerController
                 * @description
                 *
                 * Requests analysis
            **/

            var analyzer = $scope.analyzer;

            analyzerService.requestAnalysis(analyzer.url).then(function(response) {
                    $scope.analyzer.data = response.data;
                });
        };

    }]);
