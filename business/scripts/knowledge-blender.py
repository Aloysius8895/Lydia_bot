"""Create Lydia's reusable archival project model in an isolated Blender process."""
import bpy, math, json, os
from mathutils import Vector
from pathlib import Path

root=Path(__file__).resolve().parents[2]
out=root/'pic'/'hackathon-idea-lab-2026-11-08'/'blender'
assets=root/'business'/'frontend'/'src'/'assets'/'knowledge'
out.mkdir(parents=True,exist_ok=True);assets.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.device='CPU'
scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.world.color=(.3,.3,.3)
scene.view_settings.view_transform='AgX'

def mat(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.72
 return m
blue=mat('Lydia slate blue',(.24,.36,.49));paper=mat('Warm archival paper',(.82,.79,.68));label=mat('Spine labels',(.67,.74,.79));hole=mat('Binder rings',(.035,.045,.06))
def box(name,loc,scale,material,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(material)
 mod=o.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=3
 o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o
binders=[]
for i in range(3):
 x=(i-1)*.35
 binders.append(box('Project binder '+str(i),(x,0,.61),(.31,.84,1.22),blue))
 box('Paper block '+str(i),(x,0,1.235),(.23,.71,.035),paper,.008)
 box('Spine label '+str(i),(x,-.428,.87),(.17,.012,.25),label,.006)
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.043,depth=.014,location=(x,-.436,.26),rotation=(math.pi/2,0,0))
 bpy.context.object.data.materials.append(hole)
model=[o for o in scene.objects]
bpy.ops.object.camera_add(location=(4,-6,4.2));cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.6))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.45;scene.camera=cam
for loc,power,size in [((1,-4,6),450,5),((-4,-1,3),220,4),((1,4,4),350,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=size
 l.rotation_euler=(Vector((0,0,.4))-l.location).to_track_quat('-Z','Y').to_euler()
for name,color in [('slate',(.24,.36,.49)),('ivory',(.75,.71,.61)),('sand',(.55,.39,.21))]:
 blue.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
 blue.diffuse_color=(*color,1)
 scene.render.filepath=str(assets/('binders-'+name+'.png'));bpy.ops.render.render(write_still=True)
blue.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.24,.36,.49,1)
bpy.ops.object.select_all(action='DESELECT')
for o in model:o.select_set(True)
bpy.context.view_layer.objects.active=binders[0]
bpy.ops.export_scene.gltf(filepath=str(out/'project-binders.glb'),use_selection=True,export_format='GLB')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'lydia-project-binders.blend'))
(out/'manifest.json').write_text(json.dumps({'created_with':bpy.app.version_string,'isolated_process':True,'source':'knowledge-blender.py','sprites':[str(p.name) for p in assets.glob('*.png')],'model_objects':len(model),'triangles':sum(len(o.data.polygons)*2 for o in model if o.type=='MESH')},indent=2))
print('LYDIA_ASSETS_READY')
