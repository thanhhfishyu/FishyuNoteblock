src=open('index.src.html').read(); core=open('core.js').read()
open('index.html','w').write(src.replace('/*CORE*/',core))
print('built', len(src)+len(core))
