import os
import shutil
import requests
import os.path as path

from django.conf import settings

from rest_framework.views import APIView, status
from rest_framework.response import Response

from .analyzer import get_har_data_as_json, generate_hash_id
from .models import AnalysisInfo
from .serializers import AnalysisInfoSerializer


class SendAnalysisViewSet(APIView):
    """
    This view will send a POST to the analyzer, and create an instance of
    AnalysisInfo model.
    """

    def post(self, request):
        data = request.DATA
        url_to_analyze = data['url']
        hash_id = generate_hash_id(url_to_analyze)

        # TODO: do the POST request to the analyzer according with this:
        # curl -k --data-binary "http://www.reddit.com/r/haskell/" --http2 https://instr.httpdos.com:1070/setnexturl/
        # varify=False is the equivalent to curl -k
        requests.post(settings.ANALYZER_URL, data={'url': url_to_analyze}, verify=False)

        analysis_info, created = AnalysisInfo.objects.get_or_create(
            url_analyzed=url_to_analyze,
            analysis_id=hash_id
        )

        return Response(AnalysisInfoSerializer(analysis_info).data, status=status.HTTP_200_OK)


class AnalyzerMockingViewSet(APIView):
    """
    This view is a mocking of the analyzer.
    """

    def post(self, request):
        data = request.DATA

        hash_id = generate_hash_id(data['url'])
        analysis_result_path = os.path.join(settings.ANALYSIS_RESULT_PATH, hash_id)

        # Creating the dir for the results
        if not path.exists(analysis_result_path):
            os.makedirs(analysis_result_path)

        # Hard coding this for now, it is just a mocking
        http2_har_file_path = os.path.join(settings.MEDIA_ROOT, settings.HTTP2_HAR_FILENAME)
        http1_har_file_path = os.path.join(settings.MEDIA_ROOT, settings.HTTP1_HAR_FILENAME)

        shutil.copy(http2_har_file_path, analysis_result_path)
        shutil.copy(http1_har_file_path, analysis_result_path)

        # Generating success responses for now, we could later set a couple of
        # settings vars to simulate the other states
        status_done_file_path = os.path.join(analysis_result_path, settings.ANALYSIS_RESULTS_DONE_FILE_NAME)
        status_done_file = open(status_done_file_path, 'w')
        status_done_file.close()

        return Response(status=status.HTTP_200_OK)


class GetAnalysisState(APIView):
    """
    This view returns the status for the given analysis
    """

    def get(self, request, analysis_id):
        try:
            analysis = AnalysisInfo.objects.get(analysis_id=analysis_id)
        except AnalysisInfo.DoesNotExist:
            return Response(status=status.HTTP_400_BAD_REQUEST)
        if analysis.state == AnalysisInfo.STATE_DONE:
            return Response({
                'state': AnalysisInfo.STATE_DONE,
                'data': {
                    'http1_json_data': analysis.http1_json_data,
                    'http2_json_data': analysis.http2_json_data
                }
            })
        if analysis.state == AnalysisInfo.STATE_SENT:
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
                http1_json_data, http2_json_data = get_har_data_as_json(result_dir)

                analysis.state = AnalysisInfo.STATE_DONE
                analysis.http1_json_data = http1_json_data
                analysis.http2_json_data = http2_json_data
                analysis.save()
                return Response(AnalysisInfoSerializer(analysis).data)
            elif path.exists(
                    path.join(
                        result_dir,
                        settings.ANALYSIS_RESULTS_FAILED_FILE_NAME
                    )
            ):
                analysis.state = AnalysisInfo.STATE_FAILED
                analysis.save()
                return Response(AnalysisInfoSerializer(analysis).data)
            elif path.exists(
                    path.join(
                        result_dir,
                        settings.ANALYSIS_RESULTS_PROCESSING_FILE_NAME
                    )
            ):
                # TODO: We should read the percent of processing inside settings.ANALYSIS_RESULTS_PROCESSING_FILE_NAME
                # to send this data to the front-end and the progress var gets updated in the front-end accordingly.
                # We should agree the format of the progressing info with Alcides.
                return Response({
                    'state': AnalysisInfo.STATE_PROCESSING,
                    'data': ''  # send the settings.ANALYSIS_RESULTS_PROCESSING_FILE_NAME content as JSON?
                })
            else:
                # TODO what to do in this case?
                # Returning the analysis_info data for now, but we should check this case
                return Response(AnalysisInfoSerializer(analysis).data)
