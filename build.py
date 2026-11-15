src=open('index.src.html').read(); core=open('core.js').read(); v3=open('v3d.js').read()
open('index.html','w').write(src.replace('/*CORE*/',core).replace('/*V3D*/',v3))
print('built')
