import os
import django
from django.contrib.auth import get_user_model

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'quantarax_backend.settings')
django.setup()

User = get_user_model()
username = 'admin'
email = 'admin@quantarax.com'
password = 'adminpassword123'

if not User.objects.filter(username=username).exists():
    User.objects.create_superuser(username, email, password)
    print(f"Superuser '{username}' created.")
else:
    u = User.objects.get(username=username)
    u.set_password(password)
    u.save()
    print(f"Superuser '{username}' password updated.")
