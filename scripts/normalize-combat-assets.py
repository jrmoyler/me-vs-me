"""Pack generated four-column/seven-row combat art; preserve source alpha.
Usage: python3 scripts/normalize-combat-assets.py /path/to/asset-sources.json
This is deterministic atlas packing, not pose synthesis.
"""
import json, sys
from io import BytesIO
from pathlib import Path
from PIL import Image
sources=json.loads(Path(sys.argv[1]).read_text())
root=Path(__file__).resolve().parent.parent
import numpy as np
from scipy import ndimage
for identity,path in sources['fighters'].items():
    im=Image.open(path).convert('RGBA'); rgba=np.array(im); h,w=rgba.shape[:2]
    labels,count=ndimage.label(rgba[:,:,3]>16)
    components=[]
    for number,bb in enumerate(ndimage.find_objects(labels),1):
        if bb is None: continue
        yy,xx=bb; area=np.count_nonzero(labels[bb]==number)
        if area<4000: continue
        # One source has an uppercut arc touching the preceding cross effect.
        # Split that connected component at its narrowest row near the grid break.
        sections=[(yy.start,yy.stop)]
        if yy.stop-yy.start>340:
            boundary=round((yy.start+yy.stop)/2/(h/7))*(h/7)
            lo=max(yy.start+40,round(boundary-40));hi=min(yy.stop-40,round(boundary+40))
            projection=np.count_nonzero(labels[lo:hi,xx]==number,axis=1)
            cut=lo+int(np.argmin(projection))
            sections=[(yy.start,cut),(cut,yy.stop)]
        for top,bottom in sections:
            row=min(6,int((top+bottom)/2/(h/7)));col=min(3,int((xx.start+xx.stop)/2/(w/4)))
            components.append((number,row,col,top,bottom,xx.start,xx.stop))
    mask=np.full((h,w),-1,dtype=np.int16)
    for number,row,col,top,bottom,left,right in components:
        region=mask[top:bottom,left:right]
        region[labels[top:bottom,left:right]==number]=row*4+col
    # Assign detached antialias pixels and effect fragments to the closest pose.
    # This prevents neighboring feet or hands bleeding into another atlas cell.
    _,nearest=ndimage.distance_transform_edt(mask<0,return_indices=True)
    mask=mask[nearest[0],nearest[1]]
    poses=[]
    for frame in range(28):
        data=rgba.copy();data[:,:,3]=np.where(mask==frame,rgba[:,:,3],0)
        pose=Image.fromarray(data);bbox=pose.getbbox()
        if not bbox: raise ValueError(f'{identity}: empty frame {frame}')
        poses.append((pose.crop(bbox),bbox))
    seed=poses[0][0];scale=min(176/seed.height,270/max(max(p.width,p.height)for p,_ in poses))
    out=Image.new('RGBA',(1280,2240))
    for frame,(pose,bbox) in enumerate(poses):
        row,col=divmod(frame,4)
        pose=pose.resize((round(pose.width*scale),round(pose.height*scale)),Image.Resampling.NEAREST)
        # Trim only transparent resampling margins; never alter colored pixels.
        pose=pose.crop(pose.getbbox())
        x=round(160+(bbox[0]-(col+.5)*w/4)*scale)
        x=max(12,min(308-pose.width,x))
        out.alpha_composite(pose,(col*320+x,row*320+296-pose.height))
    packed=BytesIO();out.save(packed,format='PNG',optimize=True)
    destination=root/f'public/assets/characters/{identity}-combat.png'
    data=packed.getvalue();destination.write_bytes(data)
    assert destination.read_bytes()==data
    Image.open(destination).load()
    print(identity,im.size,'->',out.size,flush=True)
for identity,path in sources['arenas'].items():
    im=Image.open(path).convert('RGB')
    packed=BytesIO(); im.resize((1536,864),Image.Resampling.LANCZOS).save(packed,format='WEBP',quality=92,method=6)
    destination=root/f'public/assets/arenas/{identity}-v2.webp'
    data=packed.getvalue(); destination.write_bytes(data)
    assert destination.read_bytes()==data
    Image.open(destination).load()
    print(identity,'-> webp')
