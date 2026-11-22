"""Publish the worker's detailed report through the established Algoma direct API."""
import importlib.util
import json
from pathlib import Path
import re
import sys

helper = Path.home()/'.agents/skills/subagent-use/scripts/algoma_reports.py'
spec = importlib.util.spec_from_file_location('algoma_direct', helper)
google = importlib.util.module_from_spec(spec)
spec.loader.exec_module(google)

def publish(source):
    source = Path(source).resolve()
    data = json.loads(source.read_text(encoding='utf-8'))
    text = data['text']
    # The report is built from whitelisted metadata, redacted cues and public
    # output openings. Never embed credentials or raw request payloads.
    if re.search(r'\b(?:sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})\b', text):
        raise ValueError('Credential-shaped value in report')
    token = google.algoma_token({'algoma_oauth_prefix':'GOOGLE_COMPANY'})
    about = google.request(google.DRIVE+'/about?fields=user(emailAddress)', token=token)
    if about.get('user',{}).get('emailAddress','').lower() != 'randy.lin@algomau.ca':
        raise ValueError('Unexpected Algoma account; no document created')
    doc = google.request(google.DOCS, method='POST', payload={'title':data['title']}, token=token)
    doc_id = doc['documentId']
    created=source.with_name(source.stem+'-doc-created.json')
    with created.open('x',encoding='utf-8') as stream:json.dump({'url':'https://docs.google.com/document/d/'+doc_id+'/edit'},stream)
    requests=[{'insertText':{'location':{'index':1},'text':text}},
              {'updateTextStyle':{'range':{'startIndex':1,'endIndex':1+google.utf16_length(text)},
                                  'textStyle':{'weightedFontFamily':{'fontFamily':'Arial'},'fontSize':{'magnitude':10,'unit':'PT'}},
                                  'fields':'weightedFontFamily,fontSize'}}]
    seen=set()
    for heading in data['headings']:
        if heading['text'] in seen:continue
        seen.add(heading['text'])
        marker=heading['text']+'\n'
        # Repeated policy labels are all styled, not just the first occurrence.
        start=0
        while (at:=text.find(marker,start))>=0:
            left=1+google.utf16_length(text[:at]);right=left+google.utf16_length(marker)
            requests.append({'updateParagraphStyle':{'range':{'startIndex':left,'endIndex':right},
                             'paragraphStyle':{'namedStyleType':'HEADING_'+str(heading['level'])},'fields':'namedStyleType'}})
            start=at+len(marker)
    title_end=1+google.utf16_length(text.split('\n',1)[0])
    requests.append({'updateParagraphStyle':{'range':{'startIndex':1,'endIndex':title_end},'paragraphStyle':{'namedStyleType':'TITLE'},'fields':'namedStyleType'}})
    google.request(google.DOCS+'/'+doc_id+':batchUpdate',method='POST',payload={'requests':requests},token=token)
    saved=google.request(google.DOCS+'/'+doc_id+'?fields=body(content(paragraph(elements(textRun(content)))))',token=token)
    if google.body_text(saved).rstrip('\n')!=text.rstrip('\n'):
        raise ValueError('Document text verification mismatch: '+doc_id)
    receipt={'url':'https://docs.google.com/document/d/'+doc_id+'/edit','account':about['user']['emailAddress'],
             'verified':True,'characters':len(text),'source':str(source)}
    destination=source.with_name(source.stem+'-doc-receipt.json')
    with destination.open('x',encoding='utf-8') as stream:json.dump(receipt,stream,ensure_ascii=False,indent=2)
    print(json.dumps(receipt))

if __name__=='__main__':publish(sys.argv[1])
