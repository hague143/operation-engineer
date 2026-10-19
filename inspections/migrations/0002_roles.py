from django.db import migrations


def create_roles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    for name in ("Inspector", "Reviewer"):
        Group.objects.using(schema_editor.connection.alias).get_or_create(name=name)


class Migration(migrations.Migration):
    dependencies = [("inspections", "0001_initial")]
    operations = [migrations.RunPython(create_roles, migrations.RunPython.noop)]
