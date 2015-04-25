import os
import shutil
import os.path as path
import logging as lg
import subprocess as sp
import tempfile

from django.conf import settings

from rest_framework.views import APIView, status
from rest_framework.response import Response

from .analyzer import (
    get_har_data_as_json,
    generate_hash_id,
)
from .models import AnalysisInfo
from .serializers import AnalysisInfoSerializer
from .system import getopenssl_env


class SendAnalysisViewSet(APIView):

    """
    This view will send a POST to the analyzer, and create an instance of
    AnalysisInfo model.
    """

    def post(self, request):
        data = request.DATA
        url_to_analyze = data['url_analyzed']

        # There down I'm doing the equivalent of this.
        #
        # curl -k --data-binary "http://www.reddit.com/r/haskell/" --http2 https://instr.httpdos.com:1070/setnexturl/
        #
        # I'm using curl because requests doesn't support HTTP/2,
        # and the Haskell webserver is listening using HTTP/2 . The latest version of curl
        # is okej with that. .....

        logger = lg.getLogger("http2front")
        try:
            output_stream = tempfile.TemporaryFile(prefix="http2_django_tmp_")
            p = sp.Popen(
                args=[
                    settings.RECENT_CURL_BINARY_LOCATION,
                    "-k",
                    "--data-binary", url_to_analyze.encode('ascii'),
                    "--http2",
                    settings.ANALYZER_URL
                ],
                stdout=output_stream,
                stderr=sp.STDOUT,
                env=getopenssl_env()
            )
            process_exit_code = p.wait()
            # TODO: Get the hash_id from the response...
            # I know that contents has the hash_id, but we will
            # need to parse that to get this. I also tried "communicate" method,
            # and I tried to store the hash_id in an output file passing this
            # option to curl command, and any of them worked for me :(
            output_stream.seek(0)
            contents = output_stream.read()
            # We need to figure out how to get the hash_id, and set this to
            # the local var hash_id... something like below...
            # hash_id = parse_contents(contents)
            hash_id = contents # TODO: remove this, just for testing...

        except sp.SubprocessError as e:
            logger.error("Could not invoke process, Popen raised ... ", exc_info=True)
            return Response({"error": "Internal error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if process_exit_code != 0:
            output_stream.seek(0)
            contents = output_stream.read()
            logger.error("Curl returned error, error information: %s ", contents)
            return Response({"error": "Internal error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # We should create an instance at this point.
        analysis_info = AnalysisInfo.objects.create(
            url_analyzed=url_to_analyze,
            analysis_id=hash_id,
            state=AnalysisInfo.STATE_SENT
        )

        return Response(AnalysisInfoSerializer(analysis_info).data, status=status.HTTP_200_OK)


class AnalyzerMockingViewSet(APIView):

    """
    This view is a mocking of the analyzer.
    """

    def post(self, request):
        data = request.DATA
        hash_id = generate_hash_id(list(data.dict().keys())[0])
        analysis_result_path = os.path.join(
            settings.ANALYSIS_RESULT_PATH,
            hash_id)

        # Creating the dir for the results
        if not path.exists(analysis_result_path):
            os.makedirs(analysis_result_path)

        # Hard coding this for now, it is just a mocking
        http2_har_file_path = os.path.join(
            settings.MEDIA_ROOT,
            settings.HTTP2_HAR_FILENAME)
        http1_har_file_path = os.path.join(
            settings.MEDIA_ROOT,
            settings.HTTP1_HAR_FILENAME)

        shutil.copy(http2_har_file_path, analysis_result_path)
        shutil.copy(http1_har_file_path, analysis_result_path)

        # Generating success responses for now, we could later set a couple of
        # settings vars to simulate the other states
        status_done_file_path = os.path.join(
            analysis_result_path,
            settings.ANALYSIS_RESULTS_PROCESSING_FILE_NAME)
        status_done_file = open(status_done_file_path, 'w')
        status_done_file.write('0')
        status_done_file.close()

        return Response(status=status.HTTP_200_OK)


class GetAnalysisState(APIView):

    """
    This view returns the status for the given analysis
    """

    def get(self, request, analysis_id):
        logger = lg.getLogger("http2front")
        try:
            analysis = AnalysisInfo.objects.get(analysis_id=analysis_id)
        except AnalysisInfo.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            message = str(e)
            logger.error("GetAnalysisState: %s" % message)
            return Response({"error": message}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            result = AnalysisInfoSerializer(analysis).data
            # otherwise check status via the files
            if (analysis.state == AnalysisInfo.STATE_SENT or
                    analysis.state == AnalysisInfo.STATE_PROCESSING):
                progress = {}
                result_dir = path.join(
                    settings.ANALYSIS_RESULT_PATH, analysis.analysis_id
                )
                # if the done file exists
                if path.exists(
                        path.join(
                            result_dir,
                            settings.ANALYSIS_RESULTS_DONE_FILE_NAME
                        )
                ):
                    http1_json_data, http2_json_data = get_har_data_as_json(
                        result_dir)

                    analysis.state = AnalysisInfo.STATE_DONE
                    analysis.http1_json_data = http1_json_data
                    analysis.http2_json_data = http2_json_data
                elif path.exists(
                        path.join(
                            result_dir,
                            settings.ANALYSIS_RESULTS_FAILED_FILE_NAME
                        )
                ):
                    analysis.state = AnalysisInfo.STATE_FAILED
                elif path.exists(
                        path.join(
                            result_dir,
                            settings.ANALYSIS_RESULTS_PROCESSING_FILE_NAME
                        )
                ):
                    progress_file_path = path.join(
                        result_dir,
                        settings.ANALYSIS_RESULTS_PROCESSING_FILE_NAME
                    )
                    progress_info = open(progress_file_path).read()
                    progress = {'progress': progress_info}  # for now
                    analysis.state = AnalysisInfo.STATE_PROCESSING
                else:
                    # TODO what to do in this case?
                    # Returning the analysis_info data for now, but we should check
                    # this case
                    pass
                # save new status
                analysis.save()
                result = AnalysisInfoSerializer(analysis).data

                if progress:
                    result.update(progress)
        except Exception as e:
            message = str(e)
            logger.error("GetAnalysisState: %s" % message)
            return Response({"error": message}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # and return data
        return Response(result)
