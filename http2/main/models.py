import ast

from django.db import models

from .analyzer import generate_hash_id, format_json, fit_times


class AnalysisInfo(models.Model):
    STATE_SENT = 'sent'
    STATE_FAILED = 'failed'
    STATE_DONE = 'done'
    STATE_PROCESSING = 'processing'
    STATE_QUEUEFULL = 'queuefull'
    STATE_CHOICES = (
        (STATE_SENT, 'Sent'),
        (STATE_FAILED, 'Failed'),
        (STATE_DONE, 'Done'),
        (STATE_PROCESSING, 'Processing'),
        (STATE_QUEUEFULL, 'Queue full')
    )
    analysis_id = models.CharField(max_length=60, editable=False)
    # state of the analysis
    state = models.CharField(
        choices=STATE_CHOICES,
        max_length=10,
        default=STATE_SENT
    )
    # URL analyzed
    url_analyzed = models.URLField()
    # data for http 1 request
    http1_json_data = models.TextField(null=True)
    # data for http 2 request
    http2_json_data = models.TextField(null=True)
    # Analysis created
    created_at = models.DateTimeField(auto_now_add=True)
    when_done = models.DateTimeField(null=True)

    def __unicode__(self):
        return self.url_analyzed

    def save(self, *args, **kwargs):
        # Populating analysis ID

        super(AnalysisInfo, self).save(*args, **kwargs)

    def get_json(self):
        if self.http1_json_data and self.http2_json_data:
            # Let's make a try without actually changing the times...
            # return fit_times(
            #     format_json(
            #         ast.literal_eval(str(self.http1_json_data)),
            #         ast.literal_eval(str(self.http2_json_data))
            #     )
            # )
            return format_json(
                    ast.literal_eval(str(self.http1_json_data)),
                    ast.literal_eval(str(self.http2_json_data))
                )
        return {}
