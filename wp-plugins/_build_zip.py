import zipfile, os, shutil
src = 'alena-delivery-zones'
zipname = 'alena-delivery-zones.zip'
with zipfile.ZipFile(zipname, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            arc  = full.replace(os.sep, '/')
            zf.write(full, arc)
shutil.copy(zipname, 'alena-dz-v050.zip')
print('size:', os.path.getsize(zipname))
