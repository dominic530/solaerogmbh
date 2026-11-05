#!/usr/bin/env python3
"""Renders sections/solaero-3d-captaen.liquid with python-liquid (Shopify filters stubbed) into preview/index.html for local testing."""
import re, json, pathlib
from liquid import Environment, FileSystemLoader
from liquid.filter import with_environment
root=pathlib.Path(__file__).resolve().parent.parent
env=Environment(loader=FileSystemLoader([str(root/'snippets'),str(root/'sections')],ext='.liquid'),autoescape=False)
env.add_filter('asset_url',lambda v:'../assets/'+str(v))
env.add_filter('stylesheet_tag',lambda u:'<link rel="stylesheet" href="%s">'%u)
env.add_filter('handleize',lambda v:re.sub(r'[^a-z0-9]+','-',str(v).lower()).strip('-'))
env.add_filter('image_url',lambda v,**k:str(v))
src=(root/'sections/solaero-3d-captaen.liquid').read_text()
schema=json.loads(re.search(r'\{% schema %\}(.*?)\{% endschema %\}',src,re.S).group(1))
body=re.sub(r'\{% schema %\}.*?\{% endschema %\}','',src,flags=re.S)
settings={s['id']:s.get('default','') for s in schema['settings'] if 'id' in s}
blocks=[{'settings':b['settings']} for b in schema['presets'][0]['blocks']]
section={'id':'template--captaen','settings':settings,'blocks':blocks,'shopify_attributes':''}
html=env.from_string(body).render(section=section)
page='''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SOLAERO 3D Test</title>
<style>body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;margin:0;background:#fff;color:#111}.box{max-width:420px;margin:60px auto;padding:24px;border:1px solid #e5e5e5;border-radius:16px}
h1{font-size:20px;margin:0 0 6px}p{color:#666;margin:0 0 18px;font-size:14px}.price{font-size:22px;font-weight:600;margin-bottom:14px}.buy{width:100%;margin-top:10px;padding:14px;border-radius:999px;border:0;background:#c8f;color:#fff;font-weight:700}</style></head>
<body><div class="box"><h1>CAPTAEN</h1><p>Testseite – simulierte Verkaufsbox</p><div class="price">189,00 €</div>
'''+html+'''<button class="buy">In den Warenkorb</button></div></body></html>'''
(root/'preview/index.html').write_text(page); print('rendered',len(page),'bytes')
