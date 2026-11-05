#!/usr/bin/env python3
"""Pack a SOLAERO GLB into the compact SOLAERO-3D web format (decimated, 16-bit quantised, mirrored parts stored once).

usage: pack_model.py in.glb out.js model-key [--faces temple=14000,frame=9000,lens=1400,pad=900]
The output is a small JS asset:  window.SOLAERO3D.models["model-key"]="<base64>";
Binary layout:  u32 headerLength | header JSON (utf8, padded to 4) | per part: int16 xyz*nv | int8 xyz*nv | uint16 idx*ni (each block padded to 4)
"""
import sys, json, base64, struct, re, numpy as np, trimesh, fast_simplification
from scipy.spatial import cKDTree

def pad4(b): return b+b'\0'*((-len(b))%4)

def target_for(name,faces,cfg):
    for key,v in cfg.items():
        if key in name: return min(faces,v)
    return min(faces,6000)

AGG=int(__import__('os').environ.get('AGG','3'))
def main():
    src,dst,key=sys.argv[1:4]
    cfg={'temple':30000,'frame':6000,'lens':900,'pad':500,'arm':500,'acetate':14000,'rim':3000,'bridge':3000}
    if '--faces' in sys.argv:
        for kv in sys.argv[sys.argv.index('--faces')+1].split(','):
            k,v=kv.split('='); cfg[k]=int(v)
    sc=trimesh.load(src)
    geoms=dict(sc.geometry)
    allv=np.vstack([g.vertices*1000 for g in geoms.values()])
    lo,hi=allv.min(0),allv.max(0); center=(lo+hi)/2; half=float((hi-lo).max()/2)
    mats=[]; matidx={}
    parts=[]; blobs=[]
    done_mirror=set()
    names=sorted(geoms)
    for name in names:
        # skip right-hand twins that mirror a left-hand part (stored once, drawn twice)
        mL=re.match(r'^(.*)_L$',name)
        mR=re.match(r'^(.*)_R$',name)
        if mR and (mR.group(1)+'_L') in geoms:
            a=geoms[mR.group(1)+'_L'].vertices*1000; b=geoms[name].vertices*1000
            ma=a*np.array([-1,1,1])
            vl=geoms[mR.group(1)+'_L'].volume; vr=geoms[name].volume
            if np.allclose(ma.min(0),b.min(0),atol=0.6) and np.allclose(ma.max(0),b.max(0),atol=0.6) and abs(abs(vl)-abs(vr))<0.03*abs(vl):
                continue
        g=geoms[name]; m=g.visual.material
        col=np.array(getattr(m,'baseColorFactor',[255,255,255,255]),float)
        col=col/255. if col.max()>1.5 else col
        sig=(tuple(np.round(col,4)),float(getattr(m,'metallicFactor',0) or 0),float(getattr(m,'roughnessFactor',1) or 1),getattr(m,'alphaMode',None))
        if sig not in matidx:
            matidx[sig]=len(mats)
            mats.append({'c':[round(float(x),4) for x in col],'m':round(sig[1],3),'r':round(sig[2],3),'blend':1 if sig[3]=='BLEND' else 0})
        V=g.vertices*1000; F=g.faces
        tgt=target_for(name,len(F),cfg)
        if tgt<len(F):
            v2,f2=fast_simplification.simplify(V.astype(np.float32),F.astype(np.int32),target_count=tgt,agg=AGG)
            for _ in range(6):                                  # the quadric pass stops early on thin slabs -> repeat until the budget is met
                if len(f2)<=tgt*1.15: break
                v2,f2=fast_simplification.simplify(v2.astype(np.float32),f2.astype(np.int32),target_count=tgt,agg=AGG)
        else: v2,f2=V.astype(np.float32),F.astype(np.int32)
        # smooth normals taken from the ORIGINAL surface (keeps the polished look on the decimated mesh)
        if 'lens' in name:      # thin glass slab: per-vertex normal of the dominant adjacent face group (no edge-wall bleed), then smoothed
            tm=trimesh.Trimesh(v2,f2,process=False); fnorm=tm.face_normals; area=tm.area_faces
            vf=[[] for _ in range(len(v2))]
            for fi,f in enumerate(f2):
                for v in f: vf[v].append(fi)
            n2=np.zeros((len(v2),3))
            for vi,fl in enumerate(vf):
                if not fl: n2[vi]=[0,0,1]; continue
                ref=fnorm[fl[int(np.argmax(area[fl]))]]
                sel=[fi for fi in fl if fnorm[fi]@ref>0.7]
                n2[vi]=(fnorm[sel]*area[sel][:,None]).sum(0)
            n2/=np.maximum(np.linalg.norm(n2,axis=1)[:,None],1e-9)
            import scipy.sparse as sp
            A=sp.coo_matrix((np.ones(len(tm.edges)),(tm.edges[:,0],tm.edges[:,1])),shape=(len(v2),len(v2))).tocsr(); A=A+A.T; A.data[:]=1
            for _ in range(4):
                n2=n2+0.9*(A@n2)/np.maximum(np.asarray(A.sum(1)),1); n2/=np.linalg.norm(n2,axis=1)[:,None]
        else:
            nrm=g.vertex_normals; _,ii=cKDTree(V).query(v2); n2=nrm[ii]
        # make sure faces are wound consistently with normals
        tri=v2[f2]; fn=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]); vn=n2[f2].sum(1)
        flip=(fn*vn).sum(1)<0
        f2=f2.copy(); f2[flip]=f2[flip][:,::-1]
        assert len(v2)<65535,(name,len(v2))
        q=np.clip(np.round((v2-center)/half*32767),-32767,32767).astype('<i2')
        n8=np.clip(np.round(n2/np.maximum(np.linalg.norm(n2,axis=1)[:,None],1e-9)*127),-127,127).astype('<i1')
        idx=f2.astype('<u2').reshape(-1)
        mirror=bool((name.endswith('_L') and (name[:-2]+'_R') in geoms and name[:-2]+'_R' not in [p['name'] for p in parts]) )
        parts.append({'name':name,'mat':matidx[sig],'nv':int(len(v2)),'ni':int(len(idx)),'mirror':1 if (mL and (mL.group(1)+'_R') in geoms) else 0})
        blobs.append(pad4(q.tobytes())+pad4(n8.tobytes())+pad4(idx.tobytes()))
        print('%-12s faces %6d -> %6d  verts %6d  mirror=%d'%(name,len(F),len(f2),len(v2),parts[-1]['mirror']))
    head={'key':key,'center':[round(float(x),4) for x in center],'half':round(half,4),'mats':mats,'parts':parts}
    hj=json.dumps(head,separators=(',',':')).encode(); hb=hj+b' '*((-len(hj))%4)
    blob=struct.pack('<I',len(hb))+hb+b''.join(blobs)
    b64=base64.b64encode(blob).decode()
    open(dst,'w').write('window.SOLAERO3D=window.SOLAERO3D||{models:{}};window.SOLAERO3D.models["%s"]="%s";\n'%(key,b64))
    import gzip
    print('binary %.0f KB | js %.0f KB | js gzip %.0f KB'%(len(blob)/1024,len(b64)/1024,len(gzip.compress(b64.encode(),9))/1024))
main()
