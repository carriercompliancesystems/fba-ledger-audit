"""Validate the production content graph with Python's standard library."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from xml.etree import ElementTree as ET
import hashlib
import json
import re

ROOT=Path(__file__).resolve().parents[2]
ORIGIN="https://fba-ledger-audit.pages.dev"
def webpath(p):
    return "/" if p.name=="index.html" else "/"+p.relative_to(ROOT).with_suffix("").as_posix()

class Page(HTMLParser):
    def __init__(self, file):
        super().__init__(convert_charrefs=True)
        self.file=file
        self.ids=set(); self.links=[]; self.text=[]; self.title=""; self.description=""; self.canonical=""; self.schema=[]
        self.state=""; self.schema_text=""; self.h1=0
        self.feed(file.read_text())
    def handle_starttag(self,tag,pairs):
        a=dict(pairs)
        if a.get("id"):
            assert a["id"] not in self.ids,(self.file,"duplicate id",a["id"])
            self.ids.add(a["id"])
        if tag=="a" and a.get("href"):self.links.append(a["href"])
        if tag in ("link","script","img") and (a.get("src") or a.get("href")): self.links.append(a.get("src") or a["href"])
        if tag=="link" and a.get("rel")=="canonical":self.canonical=a["href"]
        if tag=="meta" and a.get("name")=="description":self.description=a["content"]
        if tag=="h1":self.h1+=1
        if tag=="title":self.state="title"
        if tag=="script":self.state="schema" if a.get("type")=="application/ld+json" else "script"
    def handle_endtag(self,tag):
        if tag=="script" and self.state=="schema":
            self.schema.append(json.loads(self.schema_text)); self.schema_text=""
        if tag in ("script","title"):self.state=""
    def handle_data(self,v):
        if self.state=="schema":self.schema_text+=v
        elif self.state=="title":self.title+=v
        elif self.state!="script":self.text.append(v)
pages={webpath(p):Page(p) for p in [ROOT/"index.html",*sorted((ROOT/"calculators").glob("*.html"))]}
assert len(pages)==15
def check(link,base="/"):
    full=urlsplit(urljoin(ORIGIN+base,link))
    if full.netloc!=urlsplit(ORIGIN).netloc:
        assert full.scheme=="https",(base,link)
        return
    target=full.path or "/"
    if target in pages:
        if full.fragment:assert full.fragment in pages[target].ids,(base,link)
    else:
        assert (ROOT/target.lstrip("/")).is_file(),(base,link)
for path,page in pages.items():
    assert page.h1==1 and page.title and page.description and page.canonical==ORIGIN+path,path
    assert "Not affiliated with or endorsed by Amazon.com, Inc. or any of its affiliates" in " ".join(page.text),path
    faq=next(o for o in page.schema if o["@type"]=="FAQPage")
    assert len(faq["mainEntity"])>=2
    visible=" ".join(page.text)
    for question in faq["mainEntity"]:
        assert question["name"] in visible and question["acceptedAnswer"]["text"] in visible,path
    for link in page.links:check(link,path)
for prop in ("title","description","canonical"): assert len({getattr(p,prop) for p in pages.values()})==len(pages),prop
locs=[n.text for n in ET.parse(ROOT/"sitemap.xml").iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
assert len(locs)==len(set(locs)) and set(locs)=={ORIGIN+p for p in pages}
llms=set(re.findall(r'\]\((https://[^)]+)\)',(ROOT/"llms.txt").read_text()))
assert llms==set(locs)
robots=(ROOT/"robots.txt").read_text()
for bot in ("Googlebot","Bingbot","GPTBot","OAI-SearchBot","ClaudeBot","PerplexityBot","*"):
    assert f"User-agent: {bot}\nAllow: /" in robots
assert "Sitemap: "+ORIGIN+"/sitemap.xml" in robots
for line in (ROOT/"_redirects").read_text().splitlines():
    src,dst,status=line.split();assert status=="301" and dst in pages and src!=dst
for asset in (ROOT/"assets").glob("*.js"):
    for ref in re.findall(r'from ["\'](\.[^"\']+)["\']',asset.read_text()):assert (asset.parent/ref).is_file(),(asset,ref)
menu=json.loads(re.search(r"const GROUPS = (.*?);",(ROOT/"assets/layout.js").read_text(),re.S)[1])
assert {"/calculators/"+slug for _,links in menu for _,slug in links}==set(pages)-{"/"}
for target,expected in {"functions/api/verify.js":"311b97e1d04d5d8e54a6403b78fd667824765e56","google9ebc526afdbadcaa.html":"2a747d9887d42dfa8b36918f740af7f719ef8b6c"}.items():
    raw=(ROOT/target).read_bytes()
    assert hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()==expected,target
print(f"{len(pages)} content pages, {sum(len(p.links) for p in pages.values())} HTML links and asset references, 14 menu targets, sitemap, FAQ schema, crawler files, redirects, module imports and both protected files passed.")
