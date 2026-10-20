import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "assetinspect.settings")
application = get_wsgi_application()

from .vercel_demo import prepare_demo_state

prepare_demo_state()
