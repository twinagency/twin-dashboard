import hashlib,io,json,os,pathlib,urllib.request,urllib.error,zipfile
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None
req=urllib.request.Request('https://api.github.com/repos/jesse98/twin-dashboard/actions/artifacts/11732253966/zip',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'})
try:
 response=urllib.request.build_opener(NoRedirect).open(req); data=response.read()
except urllib.error.HTTPError as e:
 if e.code not in (301,302,303,307,308): raise
 data=urllib.request.urlopen(e.headers['Location']).read()
expected='37d13829fa072e03edd8ec8fb8f83c1e72da98eb4548c4f56fe977c0929f148b'
archive=zipfile.ZipFile(io.BytesIO(data))
matches=[archive.read(n) for n in archive.namelist() if not n.endswith('/') and hashlib.sha256(archive.read(n)).hexdigest()==expected]
assert len(matches)==1,'Frozen creator-owned source hash missing or duplicated'
root=pathlib.Path('/tmp/photo-source-retained/photo-control-staging-20261012');root.mkdir(parents=True,exist_ok=True)
photo=root/'dreka-15.jpg';photo.write_bytes(matches[0])
reference={'id':'dreka-production-control','file':str(photo),'imageSha256':expected,'yes':['bare_buttocks','lingerie','suggestive_pose'],'not_positive':['nipples','genitals','anus','full_nudity','sexual_activity','sex_toy','swimwear'],'uncertain':[],'forbidden_posture':'kneeling because knees are outside the crop'}
(root/'manifest.json').write_text(json.dumps({'references':[reference]}))
print('Frozen original verified; no source-image change')
