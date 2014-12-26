/*

add "transplant" method
	var position = new THREE.Vector3();
	var quaternion = new THREE.Quaternion();
	var scale = new THREE.Vector3();
	mesh.updateMatrixWorld( true );
	mesh.matrixWorld.decompose( position, quaternion, scale );

make this.composer optional

rename pool functions to recyle / upcycle

add template instantiation function
* Make sure to call linkObjects when instantiating templates

add callback to options in populateObject
	callback can return a new object to replace one created (one created will be returned to pool)

*/

/* scene definition */
function Scene(){
	// think func
	this.time = 0;
	
	// setup scene
	this.clearColor = 0x0;
	this.scene = new THREE.Scene();

	// add fog
	this.scene.fog = new THREE.Fog(0x0, 100000, 10000000 );
	
	// camera & control
	this.camera = new THREE.PerspectiveCamera(60, renderer.webgl.domElement.width / renderer.webgl.domElement.height, 1, 2000000 );
	this.camera.name = 'camera';
	this.camera.position.set(70,70,70);
	this.camera.lookAt(0,0,0);
	this.scene.add(this.camera);
	
	// create render target / frame buffer
	var renderTargetParameters = { 
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
		format: THREE.RGBFormat, 
		stencilBuffer: false };
	this.fbo = new THREE.WebGLRenderTarget( renderer.webgl.domElement.width * renderer.scale, renderer.webgl.domElement.height * renderer.scale, renderTargetParameters );
	
	/*
	// composer
	this.composer =  new THREE.EffectComposer(renderer.webgl, this.fbo);
	
	// render pass
    var renderPass = new THREE.RenderPass( this.scene, this.camera );
    this.composer.addPass( renderPass );
    
    // last pass
    this.screenPass = new THREE.ScreenPass();
	this.composer.addPass( this.screenPass );
	*/
	
	// projector & mouse picker
	this.projector = new THREE.Projector();
	this.raycaster = new THREE.Raycaster( new THREE.Vector3(), new THREE.Vector3(), 0.01, this.camera.far ) ;
	this.floorPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
	
	// scene maker
	this.assets = [];
	
	// optimization
	this.objectPool = {};
	
	return this;
}

/* prototype */
Scene.prototype = {
	constructor: Scene,
	
	/* 	populate with scene definition
		modifies definition itself with references to now-cached assets
	*/
	populateWith:function(sceneDef, options){
		function value(obj, name, defaultVal){ if(!obj || obj[name] === undefined) return defaultVal; return obj[name]; }
	
		// config
		this.clearColor = parseInt(value(sceneDef, 'clearColor', '0'), 16);
		
		// add assets to cache if needed
		for(var i in sceneDef.assets){
			var asset = sceneDef.assets[i];
			var time;
			// compressed PixelBox asset
			if(typeof(asset) == 'string'){
				var json = LZString.decompressFromBase64(asset);
				if(!json){
					console.error("Failed to LZString decompressFromBase64: ", asset);
					continue;
				}
				try {
					asset = JSON.parse(json);
				} catch(e){
					console.error("Failed to parse JSON ",e,json);
				}
			}
			// add asset to cache if needed
			if(!assets.cache.get(asset.name)){
				assets.cache.add(asset.name, asset);
				sceneDef.assets[i] = asset;
			}
		}
		
		options = options ? options : {};
		options.templates = sceneDef.templates;

		// populate scene
		var addedObjects = this.populateObject(this.scene, sceneDef.layers, options);

		// prepare maxShadows placeholders
		var numShadows = 0;
		for(var i = 0, l = addedObjects.length; i < l; i++){
			var obj = addedObjects[i];
			if((obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight) && obj.castShadow) numShadows++;
		}
		var maxShadows = Math.max(0, sceneDef.maxShadows - numShadows);
		this.placeHolderLights = [];
		while(maxShadows){
			var sun;
			if(this.placeHolderLights.length) sun = new THREE.SpotLight(0x0, 1);
			sun = new THREE.DirectionalLight(0x0, 1);
			sun.castShadow = true;
			sun.shadowMapWidth = sun.shadowMapHeight = 128;
			this.scene.add(sun);
			this.placeHolderLights.push(sun);
			maxShadows--;
		}
		
		// link up objects targets
		this.linkObjects(addedObjects, this.scene);
		
		// update camera viewport
		THREE.PixelBoxUtil.updateViewPortUniform(null);
	},
	
	/* links "#targetName.$anchorname.targetName" style references to objects in the hierarchy
		Used by Spot and Direct lights */
	linkObjects:function(objs, top, skipProps){
		
		function dereferenceObject(nameFragments, currentLevel){
			// start
			if(typeof(nameFragments) == 'string'){
				nameFragments = nameFragments.split('.');
				if(!nameFragments.length) return top;
				return dereferenceObject(nameFragments, currentLevel);
				
			// descend
			} else if(nameFragments.length){
				var first = nameFragments[0];
				nameFragments.splice(0, 1);
				var obj = null;
				if(first.substr(0, 1) == '$') { 
					if(currentLevel.anchors)
						obj = currentLevel.anchors[first.substr(1)];
					else 
						first = first.substr(1);
				}
				if(!obj){ 
					for(var ci = 0, cl = currentLevel.children.length; ci < cl; ci++){
						if(currentLevel.children[ci].name == first){
							obj = currentLevel.children[ci];
							break;
						}
					}
				}
				if(!obj) return null;
				if(nameFragments.length) return dereferenceObject(nameFragments, obj);
				return obj;
			}
			
			return null;
		}
		// link
		for(var i = 0, l = objs.length; i < l; i++){
			var obj = objs[i];
			// do .target prop first (for lights)
			var propVal;
			var found;
			var nearestTemplate = undefined;
			if(obj instanceof THREE.SpotLight || obj instanceof THREE.DirectionalLight){
				propVal = obj.def.target;
				if(typeof(propVal) == 'string' && propVal.substr(0,1) == '#'){
					nearestTemplate = obj.nearestTemplate();
					found = dereferenceObject(propVal.substr(1), nearestTemplate ? nearestTemplate : top);
					if(found) { 
						obj.target = found;
						obj.def.target = true;
					}
				}
			}
			if(obj.def.props && !skipProps){
				for(var propName in obj.def.props){
					propVal = obj.def.props[propName];
					if(typeof(propVal) == 'string' && propVal.substr(0,1) == '#'){
						if(nearestTemplate === undefined) nearestTemplate = obj.nearestTemplate();
						found = dereferenceObject(propVal.substr(1), nearestTemplate ? nearestTemplate : top);
						if(found) { 
							obj[propName] = found;
							//obj.def.props[propName] = true;
						}
					}
				}
			}
		}
	},
	
	/* removes maxShadows placeholders */
	removePlaceHolderLights:function(){
		for(var i = 0; i < this.placeHolderLights.length; i++){
			this.scene.remove(this.placeHolderLights[i]);
		}
		this.putObjectsToPool(this.placeHolderLights);
		this.placeHolderLights.length = 0;
		this.placeHolderLights = null;
		
		THREE.PixelBoxUtil.updateLights(this.scene, true);
	},
	
	/* recursively populates object by adding layers */
	populateObject:function(object, layers, options){
		var degToRad = Math.PI / 180;
		var objectsCreated = [];
		options = options ? options : {};
		
		// create layers
		for(var i = 0; i < layers.length; i++){
			var layer = layers[i];
			// construct object
			var obj3d = null;
			var prevObj3d = null;
			var helper = null;
			
			// check if already added
			// this causes problems when populating instances
			/* if(layer.name && !options.noNameReferences && layer.asset != 'Instance'){
				if(object[layer.name]){
					obj3d = object[layer.name];
				}
			}*/
			
			// try to get an object of the same type from pool
			var objType = (typeof(layer.asset) == 'string') ? layer.asset : (this.assets[layer.asset].name);
			if(!obj3d && objType != 'Instance') obj3d = this.getObjectFromPool(objType);
			prevObj3d = obj3d;
			
			// Layer types
			switch(layer.asset){
			
			case 'Instance':
				if(!obj3d){
					// no helpers in instances
					options = _.clone(options);
					options.helpers = false;

					if(options.templates && options.templates[layer.template]){
						var objs;
						var templateDef = options.templates[layer.template];
						if(options.wrapTemplates){
							obj3d = new THREE.Object3D();
							objs = this.populateObject(obj3d, [ templateDef ], options);
							var topmost = objs[0];
							this.linkObjects(objs, topmost, !!options.skipProps);
							topmost.omit = true;
							topmost.position.set(0,0,0);
							topmost.rotation.set(0,0,0);
							topmost.scale.set(1,1,1);
							topmost.visible = true;							
							objectsCreated = objectsCreated.concat(objs);
						} else {
							objs = this.populateObject(object, [ templateDef ], options);
							obj3d = objs[0];
							objs.splice(0, 1);
							this.linkObjects(objs, obj3d, !!options.skipProps);
							objectsCreated = objectsCreated.concat(objs);
						}
						// copy some props from template
						obj3d.castShadow = (templateDef.castShadow != undefined ? templateDef.castShadow : true);
						obj3d.receiveShadow = (templateDef.receiveShadow != undefined ? templateDef.receiveShadow : true);
					} else {
						console.log('Template '+layer.template+' not found');
						if(!obj3d) obj3d = new THREE.Object3D();
					}
				}
				
				obj3d.isInstance = true;
				obj3d.isTemplate = false;
				break;
				
			case 'Camera':
				obj3d = new THREE.PerspectiveCamera(60, 1, 1, 1000);
				if(layer.fov != undefined) obj3d.fov = layer.fov;
				if(layer.near != undefined) obj3d.near = layer.near;
				if(layer.far != undefined) obj3d.far = layer.far;
				obj3d.isDefault = layer.isDefault ? true : false;
				if(!options.keepSceneCamera && obj3d.isDefault){
					if(this.camera && this.camera.parent) this.camera.parent.remove(this.camera);
					this.camera = obj3d;
					console.log(obj3d);
				}
				if(options.helpers){
					helper = new THREE.CameraHelper(obj3d);
				}
				break;
				
			case 'OrthographicCamera':
				var sz = 64;
				if(options.keepSceneCamera){ // inside editor
					obj3d = new THREE.OrthographicCamera(-sz,sz,sz,-sz,1,1000);
				} else {
					var w = renderer.webgl.domElement.width * 0.22;
					var h = renderer.webgl.domElement.height * 0.22;
					obj3d = new THREE.OrthographicCamera(-w,w,h,-h,1,1000);
				}
				if(layer.zoom != undefined){
					obj3d.zoom = layer.zoom;
					obj3d.updateProjectionMatrix();
				}
				if(layer.isDefault && (this instanceof Scene) && !this.camera.def) { 
					this.camera.parent.remove(this.camera);
					this.camera = obj3d;
				}
				obj3d.isDefault = layer.isDefault ? true : false;
				if(!options.keepSceneCamera && obj3d.isDefault){
					if(this.camera && this.camera.parent) this.camera.parent.remove(this.camera);
					this.camera = obj3d;
				}
				if(options.helpers){
					helper = new THREE.CameraHelper(obj3d);
				}
				break;
			case 'DirectionalLight':
				if(!obj3d) obj3d = new THREE.DirectionalLight(0xffffff, 1.0);
			    obj3d.shadowMapWidth = obj3d.shadowMapHeight = 1024;
			    obj3d.shadowCameraNear = 5;
				obj3d.shadowCameraFar = 10000;
				obj3d.shadowCameraRight = (layer.shadowVolumeWidth != undefined ? layer.shadowVolumeWidth : 256) * 0.5;
			    obj3d.shadowCameraLeft = -obj3d.shadowCameraRight;
				obj3d.shadowCameraTop = (layer.shadowVolumeHeight != undefined ? layer.shadowVolumeHeight : (obj3d.shadowCameraRight * 2)) * 0.5;
				obj3d.shadowCameraBottom = -obj3d.shadowCameraTop;
				obj3d.shadowBias = (layer.shadowBias != undefined ? layer.shadowBias : -0.0005);
				if(obj3d.shadowMap){
					obj3d.shadowMap.dispose();
					obj3d.shadowMap = null;
				}					
				if(obj3d.shadowCamera){
					if(obj3d.shadowCamera.parent){
						obj3d.shadowCamera.parent.remove(obj3d.shadowCamera);
					}
					obj3d.shadowCamera = null;
				}
				if(layer.color != undefined) obj3d.color.set(parseInt(layer.color, 16));
				if(layer.intensity != undefined) obj3d.intensity = layer.intensity;
				if(layer.shadowMapWidth != undefined) obj3d.shadowMapWidth = obj3d.shadowMapHeight = layer.shadowMapWidth;
				if(layer.shadowMapHeight != undefined) obj3d.shadowMapHeight = layer.shadowMapHeight;
				if(layer.target != undefined && _.isArray(layer.target) && layer.target.length == 3){// array of world pos
					obj3d.target = new THREE.Object3D();
					obj3d.target.position.set(layer.target[0],layer.target[1],layer.target[2]);
				}
				if(options.helpers) { 
			    	helper = new THREE.DirectionalLightHelper(obj3d, 5);
			    	//obj3d.shadowCameraVisible = true;
			    }
				break;						
			case 'SpotLight':
				if(!obj3d) obj3d = new THREE.SpotLight(0xffffff, 1.0, 100, Math.PI / 3, 70);
			    obj3d.shadowMapWidth = obj3d.shadowMapHeight = 1024;
			    obj3d.shadowCameraNear = 5;
				obj3d.shadowCameraFar = obj3d.distance;
				obj3d.shadowBias = (layer.shadowBias != undefined ? layer.shadowBias : -0.0005);
				if(obj3d.shadowMap){
					obj3d.shadowMap.dispose();
					obj3d.shadowMap = null;
				}					
				if(obj3d.shadowCamera){
					if(obj3d.shadowCamera.parent){
						obj3d.shadowCamera.parent.remove(obj3d.shadowCamera);
					}
					obj3d.shadowCamera = null;
				}
				if(layer.color != undefined) obj3d.color.set(parseInt(layer.color, 16));
				if(layer.intensity != undefined) obj3d.intensity = layer.intensity;
				if(layer.distance != undefined) obj3d.shadowCameraFar = obj3d.distance = layer.distance;
				if(layer.exponent != undefined) obj3d.exponent = layer.exponent;
				if(layer.angle != undefined){
					obj3d.angle = layer.angle * degToRad;
					obj3d.shadowCameraFov = layer.angle;
				}
				if(layer.shadowMapWidth != undefined) obj3d.shadowMapWidth = obj3d.shadowMapHeight = layer.shadowMapWidth;
				if(layer.shadowMapHeight != undefined) obj3d.shadowMapHeight = layer.shadowMapHeight;
				if(layer.target != undefined && _.isArray(layer.target) && layer.target.length == 3){// array of world pos
					obj3d.target = new THREE.Object3D();
					obj3d.target.position.set(layer.target[0],layer.target[1],layer.target[2]);
				}
				if(options.helpers) { 
			    	helper = new THREE.SpotLightHelper(obj3d, 5);
			    	//obj3d.shadowCameraVisible = true;
			    }
				
				break;								
			case 'PointLight':
				if(!obj3d) obj3d = new THREE.PointLight(0xffffff, 1.0);
				if(layer.color != undefined) obj3d.color.set(parseInt(layer.color, 16));
				if(layer.intensity != undefined) obj3d.intensity = layer.intensity;
				if(layer.distance != undefined) obj3d.distance = layer.distance;
				if(options.helpers) { 
					helper = new THREE.PointLightHelper(obj3d, 5);
				}
				break;						
			case 'HemisphereLight':
				if(!obj3d) obj3d = new THREE.HemisphereLight(0xffffff, 0x003366, 0.5);
				
				if(layer.colors) { obj3d.color.set(parseInt(layer.colors[0], 16)); obj3d.groundColor.set(parseInt(layer.colors[1], 16)); }
				if(layer.intensity != undefined) obj3d.intensity = layer.intensity;
				
				break;
			case 'Object3D':
				if(!obj3d) obj3d = new THREE.Object3D();
				obj3d.isContainer = true;
				break;					
			case 'Geometry':
				var geom = this.makeGeometryObject(layer);
				var mat;
				if(obj3d) {
					obj3d.geometry.dispose();
					obj3d.geometry = geom;
					mat = obj3d.material;
					
					var _gl = renderer.webgl.context;
					for (var name in geom.attributes) {
						var bufferType = ( name === 'index' ) ? _gl.ELEMENT_ARRAY_BUFFER : _gl.ARRAY_BUFFER;
						var attribute = geom.attributes[ name ];
						if(!attribute.buffer){
							attribute.buffer = _gl.createBuffer();
							var res = _gl.bindBuffer( bufferType, attribute.buffer );
							_gl.bufferData( bufferType, attribute.array, _gl.STATIC_DRAW );
						}
					}
					
				} else {
					mat = new THREE.MeshPixelBoxMaterial();
					obj3d = new THREE.Mesh(geom, mat);
				}
				
				obj3d.geometryType = layer.mesh;
				
				//material
				mat.tint.set(layer.tint != undefined ? parseInt(layer.tint, 16) : 0xffffff);
				mat.addColor.set(layer.addColor != undefined ? parseInt(layer.addColor, 16) : 0x0);
				mat.alpha = (layer.alpha != undefined ? layer.alpha : 1.0);
				mat.brightness = (layer.brightness != undefined ? layer.brightness : 0.0);
				mat.stipple = (layer.stipple != undefined ? layer.stipple : 0.0);
				break;
			
			// lookup asset by name
			default:
				var asset = assets.cache.get(layer.asset);
				if(asset){
					if(!obj3d) obj3d = new THREE.PixelBox(asset);
				} else {
					console.log("Deferred loading of "+layer.asset);
					if(!obj3d) { 
						// asset will be loaded later
						// create placeholder
						obj3d = new THREE.Object3D();
						obj3d.isPlaceholder = true;
						var a = new THREE.AxisHelper(1);
						a.isHelper = true;
						obj3d.add(a);
					}
				}
				break;	
			}					
			
			// store definition
			obj3d.def = _.deepClone(layer, 100);
			
			// set name
			if(layer.name){
				obj3d.name = layer.name;
			}
			
			// add as a child
			if(!obj3d.parent) { 
				// add to anchor, if specified
				if(layer.anchor && object.anchors){
					object.anchors[layer.anchor].add(obj3d);
				// otherwise to object itself
				} else {
					object.add(obj3d);
				}				
				obj3d.anchored = layer.anchor ? layer.anchor : false;
			} else if(obj3d != this.camera) {
				//console.log("Object "+obj3d.name+" is already attached to parent");
			}			
			
			// assign common values
			if(layer.position) {
				obj3d.position.set(layer.position[0],layer.position[1],layer.position[2]);
			} else if(!(obj3d instanceof THREE.HemisphereLight)){ // damnit!
				obj3d.position.set(0,0,0);
			}
			if(layer.rotation) { 
				obj3d.rotation.set(layer.rotation[0]*degToRad,layer.rotation[1]*degToRad,layer.rotation[2]*degToRad);
			} else {
				obj3d.rotation.set(0,0,0);
			}
			if(layer.scale) { 
				if(_.isArray(layer.scale)) obj3d.scale.set(layer.scale[0],layer.scale[1],layer.scale[2]); 
				else {
					obj3d.scale.set(layer.scale,layer.scale,layer.scale); 
				}
			} else {
				obj3d.scale.set(1,1,1);
			}
			if(layer.jostle){
				if(layer.jostle.rx) obj3d.rotation.x += (Math.random() * 2 - 1.0) * layer.jostle.rx * degToRad;
				if(layer.jostle.ry) obj3d.rotation.y += (Math.random() * 2 - 1.0) * layer.jostle.ry * degToRad;
				if(layer.jostle.rz) obj3d.rotation.z += (Math.random() * 2 - 1.0) * layer.jostle.rz * degToRad;
				if(layer.jostle.s) obj3d.scale.multiplyScalar(1.0 + (Math.random() * 2 - 1.0) * layer.jostle.s);
				if(layer.jostle.sx) obj3d.scale.x += (Math.random() * 2 - 1.0) * layer.jostle.sx;
				if(layer.jostle.sy) obj3d.scale.y += (Math.random() * 2 - 1.0) * layer.jostle.sy;
				if(layer.jostle.sz) obj3d.scale.z += (Math.random() * 2 - 1.0) * layer.jostle.sz;
				if(layer.jostle.x) obj3d.position.x += (Math.random() * 2 - 1.0) * layer.jostle.x;
				if(layer.jostle.y) obj3d.position.y += (Math.random() * 2 - 1.0) * layer.jostle.y;
				if(layer.jostle.z) obj3d.position.z += (Math.random() * 2 - 1.0) * layer.jostle.z;
			}
			if(layer.lookAt) {
				obj3d.lookAt(new THREE.Vector3(layer.lookAt[0],layer.lookAt[1],layer.lookAt[2]));
			}
			if(layer.castShadow != undefined) obj3d.castShadow = layer.castShadow;
			if(layer.receiveShadow != undefined) obj3d.receiveShadow = layer.receiveShadow;
			
			if(helper) { 
				//obj3d.parent.add(helper);
				this.scene.add(helper);
				obj3d.helper = helper;
				helper.isHelper = true;
				helper.update();
				helper.visible = false;
			}
			
			if(layer.visible != undefined) {
				obj3d.visible = layer.visible;
			} else obj3d.visible = true;
			
			// PixelBox specific
			if(!obj3d.isInstance && obj3d instanceof THREE.PixelBox){
				if(layer.pointSize != undefined) { 
					obj3d.pointSize = layer.pointSize;
				}
				if(layer.alpha != undefined) { 
					obj3d.alpha = layer.alpha;
				} else {
					obj3d.alpha = 1;
				}			
				if(layer.cullBack != undefined) obj3d.cullBack = layer.cullBack;
				if(layer.occlusion != undefined) obj3d.occlusion = layer.occlusion;
				if(layer.tint != undefined) { 
					obj3d.tint.set(parseInt(layer.tint, 16));
				} else {
					obj3d.tint.set(0xffffff);
				}
				if(layer.add != undefined) { 
					obj3d.addColor.set(parseInt(layer.add, 16));
				} else {
					obj3d.addColor.set(0x0);
				}
				if(layer.stipple != undefined) { 
					obj3d.stipple = layer.stipple;
				} else {
					obj3d.stipple = 0;
				}
				if(layer.animSpeed != undefined) obj3d.animSpeed = layer.animSpeed;
				
				if(layer.animName != undefined && obj3d.animNamed(layer.animName) != undefined){
					var animOption = layer.animOption ? layer.animOption : 'gotoAndStop';
					var animFrame = layer.animFrame != undefined ? layer.animFrame : 0;
					
					if(animOption == 'loopAnim'){
						obj3d.loopAnim(layer.animName, Infinity, false);
					} else if(animOption == 'loopFrom') { 
						obj3d.gotoAndStop(layer.animName, animFrame + 1); 
						obj3d.loopAnim(layer.animName, Infinity, true);
					} else if(animOption == 'playAnim') { 
						obj3d.playAnim(layer.animName);
					} else {
						obj3d.gotoAndStop(layer.animName, animFrame);
					}
				} else if(layer.animFrame != undefined){
					obj3d.stopAnim();
					obj3d.frame = layer.animFrame;
				}
				
				// re-add anchors if removed
				for(var a in obj3d.anchors){
					if(!obj3d.anchors[a].parent){
						obj3d.add(obj3d.anchors[a]);
					}
				}				
			}
			// add as a name reference
			if(layer.name && !options.noNameReferences){
				if(!object[layer.name]) {
					object[layer.name] = obj3d;
				// if already have one with that name
				} else {
					//console.log("skipped "+layer.name+" - already added to scene");
					object[layer.name] = obj3d;
				}
			}
			
			objectsCreated.splice(0, 0, obj3d);
			
			if(!obj3d.isInstance && !obj3d.parentInstance()){
						
				if(layer.isTemplate) obj3d.isTemplate = layer.isTemplate;
				
				// add templates for editor
				if(layer.containsTemplates && options.templates){
					for(var ti = 0; ti < layer.containsTemplates.length; ti++){
						var td = options.templates[layer.containsTemplates[ti]];
						var addedTemplates = [];
						if(td) { 
							var nc = obj3d.children.length;
							addedTemplates = addedTemplates.concat(this.populateObject(obj3d, [ options.templates[layer.containsTemplates[ti]] ], options));
							this.linkObjects(addedTemplates, obj3d.children[nc], !!options.skipProps);
							objectsCreated = objectsCreated.concat(addedTemplates);
						}
					}
				}
				
			}
			
			// recursively process children
			if(layer.layers){
				objectsCreated = objectsCreated.concat(this.populateObject(obj3d, layer.layers, options));
			}
			
		}
		
		return objectsCreated;
	},
	
	/* generates geometry for 'Geometry' object during populateObject */
	makeGeometryObject:function(layer){
		var geom;
		function param(p, def, min, max){ 
			var val;
			if(layer[p] !== undefined) val = layer[p]; 
			else val = def; 
			if(min !== undefined) val = Math.max(min, val);
			if(max !== undefined) val = Math.min(max, val);
			return val;
		}
		var degToRad = Math.PI / 180;
		switch(layer.mesh){
		case 'Sphere':
			layer.radius = param('radius',5);
			layer.widthSegments = param('widthSegments',8,3);
			layer.heightSegments = param('heightSegments',6,2);
			layer.phiStart = param('phiStart',0);
			layer.phiLength = param('phiLength',360);
			layer.thetaStart = param('thetaStart',0);
			layer.thetaLength = param('thetaLength',180);
			geom = new THREE.SphereGeometry(layer.radius, 
							layer.widthSegments, layer.heightSegments,
							layer.phiStart * degToRad, layer.phiLength * degToRad,
							layer.thetaStart * degToRad, layer.thetaLength * degToRad);
			break;
			
		case 'Box':
			layer.widthSegments = param('widthSegments',1,1);
			layer.heightSegments = param('heightSegments',1,1);
			layer.depthSegments = param('depthSegments',1,1);
			layer.width = param('width',10);
			layer.height = param('height',10);
			layer.depth = param('depth',10);
			geom = new THREE.BoxGeometry(layer.width, layer.height, layer.depth, layer.widthSegments, layer.heightSegments, layer.depthSegments);
			break;

		case 'Plane':
		default:
			layer.widthSegments = param('widthSegments',1,1);
			layer.heightSegments = param('heightSegments',1,1);
			layer.width = param('width',10);
			layer.height = param('height',10);
			geom = new THREE.PlaneBufferGeometry(layer.width, layer.height,layer.widthSegments, layer.heightSegments);
			break;
		}
		return geom;
	},
	
	/* get object from pool */
	getObjectFromPool:function(objType){
		var obj = null;
		if(this.objectPool[objType] && this.objectPool[objType].length){
			obj = this.objectPool[objType][this.objectPool[objType].length - 1];
			this.objectPool[objType].pop();
			//console.log('Object ',obj,' got from pool');
		}
		return obj;
	},
	
	/* put object into pool */
	putObjectsToPool:function(objs){
		if(!_.isArray(objs)) objs = [ objs ];
		for(var i in objs){
			var obj3d = objs[i];
			var typeName = null;
			if(obj3d instanceof THREE.PixelBox){
				typeName = obj3d.geometry.data.name;
			} else if(obj3d instanceof THREE.DirectionalLight){
				typeName = 'DirectionalLight';
			} else if(obj3d instanceof THREE.HemisphereLight){
				typeName = 'HemisphereLight';
			} else if(obj3d instanceof THREE.PointLight){
				typeName = 'PointLight';
			} else if(obj3d instanceof THREE.SpotLight){
				typeName = 'SpotLight';
			} else if(obj3d instanceof THREE.Mesh){
				typeName = 'Plane';
			} else if(obj3d instanceof THREE.Object3D && obj3d.isContainer){
				typeName = 'Object3D';
			}
			
			if(!typeName || obj3d.isAnchor){
				//console.log("putObjectToPool: Unknown object type for ", obj3d);
				continue;
			}
			
			if(!this.objectPool[typeName]) this.objectPool[typeName] = [ obj3d ];
			else this.objectPool[typeName].push(obj3d);
		}
		//console.log("Object ",obj3d,' returned to pool');
	},
	
	/* convert 3d pos to 2d for html */
	getScreenCoord:function(pos){
		var vector = pos.project(this.camera);
        vector.x = (vector.x + 1) * renderer.webgl.domElement.width * 0.5;
        vector.y = (1.0 - vector.y) * renderer.webgl.domElement.height * 0.5;
        return vector;
	},
	
	/* renderer scene management callbacks */
	onAdded:function(){
	},
	onWillAdd:function(){
		this.time = 0;
		$(window).on('resize.'+this.constructor.name,this.onResized.bind(this));
	},		
	onWillRemove:function(){
	},
	onRemoved:function(){ // called right before the scene is removed
		$(window).off('resize.'+this.constructor.name);
	},
	
	/* scene think function */
	tick:function(delta){
		this.time += delta;
	
		// think children
		// this.thinkRecursive(this.scene, delta);
				
		// update shaders
		// this.screenPass.screenUniforms.time.value += delta;
	},
	
	/* drills down hierarchy and calls think (doesn't go deeper if have .think()) */
	thinkRecursive:function(cont, delta){
		for(var i = cont.children.length - 1; i >= 0; i--){
			var child = cont.children[i];
			if(child.think != undefined) { 
				child.think.call(child, delta);
			} else {
				this.thinkRecursive(child, delta);
			}
		}
	},
	
	/* render callback */
	render:function( delta, rtt ) {
		this.tick(delta);
		
		renderer.webgl.setClearColor( this.clearColor, 1);
		
		/*this.composer.passes[this.composer.passes.length - 1].renderToScreen = !rtt;
		this.composer.render(delta);*/
		
		if (rtt) renderer.webgl.render( this.scene, this.camera, this.fbo, true );
		else renderer.webgl.render( this.scene, this.camera );
		
		if(this.placeHolderLights){
			this.removePlaceHolderLights();
		}
	},
	
	/* resize callback */
	onResized: function(){
		this.camera.aspect = renderer.webgl.domElement.width / renderer.webgl.domElement.height;
		this.camera.updateProjectionMatrix();
		var renderTargetParameters = { 
			minFilter: THREE.NearestFilter,//THREE.LinearFilter, 
			magFilter: THREE.NearestFilter,//THREE.LinearFilter, 
			format: THREE.RGBFormat, 
			stencilBuffer: false };
		this.fbo = new THREE.WebGLRenderTarget( renderer.webgl.domElement.width * renderer.scale, 
												renderer.webgl.domElement.height * renderer.scale, renderTargetParameters );
		/* this.screenPass.onResized();	
		this.composer.reset(this.fbo);*/
    }
};
/*
//changes the parent but preserves global position + rotation
THREE.Object3D.prototype.transplant = function ( parent ) {
  var target = this;
  
  // calculate new pos
  var newPos = new THREE.Vector3()
  newPos.setFromMatrixPosition( target.matrixWorld )
  parent.worldToLocal( newPos )
  target.position = newPos

  // calculate new rot
  var newRot = new THREE.Quaternion()
  newRot.setFromRotationMatrix( target.matrixWorld )
  var parentRot = new THREE.Quaternion()
  parentRot.setFromRotationMatrix( parent.matrixWorld )
  newRot.multiply( parentRot.inverse() )
  target.quaternion.copy( newRot )

  // attach to parent
  parent.add( target )

}*/


THREE.Object3D.prototype.nearestParentWithProperty = function(prop, val){
	if(this.parent){ 
		if(this.parent[prop] && (val === undefined || this.parent[prop] === val)) return this.parent;
		return this.parent.nearestParentWithProperty(prop, val);
	}
	return null;
}

THREE.Object3D.prototype.isVisibleRecursive = function(){
	if(!this.visible) return false;
	if(this.parent) return this.parent.isVisibleRecursive();
	return this.visible;	
}

THREE.Object3D.prototype.isDescendentOf = function(another){
	if(!this.parent) return false;
	if(_.isArray(another)){
		for(var i = 0, l = another.length; i < l; i++){
			var ai = another[i];
			if(this.parent == ai) return true;
			var p = this.parent.isDescendentOf(ai);
			if(p) return true;
		}
		return false;
	} else {
		if(this.parent == another) return true;
		return this.parent.isDescendentOf(another);
	}
}

THREE.Object3D.prototype.parentInstance = function(){
	if(this.isInstance) return this;
	if(!this.parent) return null;
	return this.parent.parentInstance();
};

THREE.Object3D.prototype.nearestTemplate = function(){
	if(this.isTemplate) return this;
	return this.nearestParentWithProperty('isTemplate', true);
};

THREE.Object3D.prototype.recursiveRemoveChildren = function(omit){
	var removedChildren = [];
	for(var i = 0; i < this.children.length; i++){
		var child = this.children[i];
		if(omit && omit.indexOf(child) !== -1){
			continue;
		}
		
		removedChildren = removedChildren.concat(child.recursiveRemoveChildren(omit));
		if(child.stopTweens) child.stopTweens();
		if(child.stopAnim) child.stopAnim();
		child.think = null;
		if(child['name']){
			if(child.anchored && this.parent[child.name]) {
				delete this.parent[child.name];
			} else if(this[child.name]){
				delete this[child.name];
			}
		}
		
		this.remove(child);
		removedChildren.push(child);
		
		i--;
	}
	
	return removedChildren;
};

THREE.Object3D.prototype.getObjectByUUID = function ( uuid, recursive ) {
	if ( this.uuid === uuid ) return this;

	for ( var i = 0, l = this.children.length; i < l; i ++ ) {
		var child = this.children[ i ];
		var object = child.getObjectByUUID( uuid, recursive );
		if ( object !== undefined ) {
			return object;
		}
	}
	return undefined;
};

/* deep clone */
_.deepClone = function(obj, depth) {
	if (typeof obj !== 'object') return obj;
	if (obj === null) return null;
	if (_.isString(obj)) return obj.splice();
	if (_.isDate(obj)) return new Date(obj.getTime());
	if (_.isFunction(obj.clone)) return obj.clone();
	var clone = _.isArray(obj) ? obj.slice() : _.extend({}, obj);
	// clone array's extended props
	if(_.isArray(obj)){
	  for(var p in obj){
		  if(obj.hasOwnProperty(p) && _.isUndefined(clone[p]) && isNaN(p)){
			  clone[p] = obj[p];
		  }
	  }
	}
	if (!_.isUndefined(depth) && (depth > 0)) {
	  for (var key in clone) {
	    clone[key] = _.deepClone(clone[key], depth-1);
	  }
	}
	return clone;
};