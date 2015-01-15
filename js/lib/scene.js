/*

	add numLoops param to tween
	
	add autoReverse param to tween
	
	.loop(tweenobj) called on loop
	
	
	
	

*/



/* scene constructor */
THREE.PixelBoxScene = function(){
	
	THREE.Scene.call(this);

	// setup scene
	this.clearColor = 0x0;
	this.scene = this; // compat. with editor
	
	// add fog
	this.fog = new THREE.Fog(0x0, 100000, 10000000);
	
	// add ambient
	this.ambientLight = new THREE.AmbientLight(0x0);
	this.add(this.ambientLight);
	
	// flag to call PixelBoxUtil.updateLights
	this.updateLights = true;
	
	// when updating lights, also recompile materials
	this.updateMaterials = true; 
	
	// default camera
	this._camera = new THREE.PerspectiveCamera(60, renderer.webgl.domElement.width / renderer.webgl.domElement.height, 1, 2000000 );
	this._camera.name = 'camera';
	this._camera.position.set(70,70,70);
	this._camera.lookAt(0,0,0);
	this.add(this._camera);

	Object.defineProperty(this, 'camera', {
		get: function(){ return this._camera; },
		set: function(v){ 
			this._camera = v;
			// switch camera in renderPass of composer
			if(this.useComposer && this.composer && this.composer.renderPass){
				this.composer.renderPass.camera = v;
			}
		},
	});	
	
	// create render target / frame buffer
	var renderTargetParameters = { 
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
		format: THREE.RGBFormat, 
		stencilBuffer: false };
	this.fbo = new THREE.WebGLRenderTarget( renderer.webgl.domElement.width, renderer.webgl.domElement.height, renderTargetParameters );
	
	// create composer if necessary
	if(this.useComposer){
		/* Composer requires the following classes / includes:
			<script src="js/lib/postprocessing/shaders/CopyShader.js"></script>
			<script src="js/lib/postprocessing/EffectComposer.js"></script>
			<script src="js/lib/postprocessing/RenderPass.js"></script>
			<script src="js/lib/postprocessing/ShaderPass.js"></script>
			<script src="js/lib/postprocessing/MaskPass.js"></script>
			<script src="js/lib/screenShader.js"></script>
		*/			
	
		// composer
		this.composer =  new THREE.EffectComposer(renderer.webgl, this.fbo);
		
		// render pass
	    this.composer.renderPass = new THREE.RenderPass( this, this.camera );
	    this.composer.addPass( this.composer.renderPass );	    
	    
	    // last pass - ScreenPass is an example shader in js/lib/screenShader.js
	    this.composer.screenPass = new THREE.ScreenPass();
		this.composer.addPass( this.composer.screenPass );
	}
	
	// raycaster for mouse picking
	this.raycaster = new THREE.Raycaster( new THREE.Vector3(), new THREE.Vector3(), 0.01, this.camera.far ) ;
	this.floorPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
	
	// object recycling pool
	this.objectPool = {};
	
	return this;
}

THREE.PixelBoxScene.prototype = Object.create(THREE.Scene.prototype);
THREE.PixelBoxScene.prototype.constructor = THREE.PixelBoxScene;


/* ================================================================================ THREE.PixelBoxRenderer callbacks */
	
/* called by THREE.PixelBoxRenderer after scene transition has finished */
THREE.PixelBoxScene.prototype.onAdded = function(){  };

/* 	called by THREE.PixelBoxRenderer before scene transition begins  */	
THREE.PixelBoxScene.prototype.onWillAdd = function(){  };

/* 	called by THREE.PixelBoxRenderer after transition has finished */	
THREE.PixelBoxScene.prototype.onWillRemove = function(){  };

/* 	called by THREE.PixelBoxRenderer after scene has been removed */
THREE.PixelBoxScene.prototype.onRemoved = function(){  };
	
/* ================================================================================ Scene tick */

/* scene think function */
THREE.PixelBoxScene.prototype.tick = function(delta){  };

/* ================================================================================ Instantiate a template */

/* 
	instantiate an object as defined in scene template 

		(String) templateName - name of the template from scene definition
		(Object) options - (optional) object to pass to populateObject function (see populateObject function for info)
*/

THREE.PixelBoxScene.prototype.instantiate = function(templateName, options){
	var def = this.templates[templateName];
	
	if(def) {
		options = options ? options : {};
		options.templates = this.templates;
		var objs = this.populateObject(null, [def], options);
		if(objs.length) {
			var obj = objs[0];
			this.linkObjects(objs, obj);
			return obj;
		}
		console.log("Instantiate "+templateName+" failed");
		return null;
	}
	
	console.log("Template "+templateName+" not found in scene definiton");
};
	
/* ================================================================================ Object recycling */

/* 	
	recycle(objectOrArray) - removes object(s) from parent, and recycles it
	
	this is the preferred method of removing objects in THREE.PixelBoxScene
	
	recycling dismantles object's hierarchy and stores each object in scene's objectPool ordered
	by object type and asset name.
	
	recycled objects can later be upcycled (retrieved from the pool) by object type (and reinitialized)
	
	if an object's type is not one of these, it will not be stored in the pool after removal from its parent
	
	supported object types are
		PixelBox, DirectionalLight, HemisphereLight, PointLight, SpotLight, Mesh, PerspectiveCamera, OrthographicCamera, Object3D
		(if it was created by populateObject and thus has .isContainer == true)
		Line (for representing paths)

*/

THREE.PixelBoxScene.prototype.recycle = function(scrap){
	// accept object or an array of objects
	if(!_.isArray(scrap)) scrap = [ scrap ];
	
	var objs, obj, containsLights = false;
	for(var si = 0, sl = scrap.length; si < sl; si++){
		var obj = scrap[si];
		objs = obj.recursiveRemoveChildren();
		if(obj.parent) { 
			if(obj['name']){
				if(obj.anchored && obj.parent.parent && obj.parent.parent[obj.name] == obj) {
					delete obj.parent.parent[obj.name];
				} else if(obj.parent[obj.name] == obj){
					delete obj.parent[obj.name];
				}
			}
			obj.parent.remove(obj);
		}
		objs.push(obj);
	
		for(var i = 0, l = objs.length; i < l; i++){
			obj = objs[i];
			var typeName = null;
			if(obj instanceof THREE.PixelBox){
				typeName = obj.geometry.data.name;
			} else if(obj instanceof THREE.DirectionalLight){
				typeName = 'DirectionalLight'; containsLights = true;
			} else if(obj instanceof THREE.HemisphereLight){
				typeName = 'HemisphereLight'; containsLights = true;
			} else if(obj instanceof THREE.PointLight){
				typeName = 'PointLight'; containsLights = true;
			} else if(obj instanceof THREE.SpotLight){
				typeName = 'SpotLight'; containsLights = true;
			} else if(obj instanceof THREE.Mesh){
				typeName = 'Geometry';
			} else if(obj instanceof THREE.PerspectiveCamera){
				typeName = 'Camera';
			} else if(obj instanceof THREE.OrthographicCamera){
				typeName = 'OrthographicCamera';
			} else if(obj instanceof THREE.LinePath){
				typeName = 'LinePath';
			} else if(obj instanceof THREE.Object3D && obj.isContainer){
				typeName = 'Object3D';
			}
			
			if(typeName){
				// store
				if(!this.objectPool[typeName]) { 
					this.objectPool[typeName] = [ obj ];
				} else {
					this.objectPool[typeName].push(obj);
				}
			}
		}	
	}
	
	if(containsLights) this.updateLights = true;
};

/* 
	retrieves an object of objType from objectPool
	
	used by populateObject function	
*/

THREE.PixelBoxScene.prototype.upcycle = function(objType){
	var obj = null;
	if(this.objectPool[objType] && this.objectPool[objType].length){
		obj = this.objectPool[objType][this.objectPool[objType].length - 1];
		this.objectPool[objType].pop();
	}
	return obj;
};

/* ================================================================================ Scene loading / populating */

/* 	
	populateWith(sceneDef [, options]) - populate scene with definition object
	
		(Object) sceneDef - scene definition as generated by PixelBox Scene editor
		
		(Object) options - (optional) object to pass to populateObject function (see populateObject function for info)
	
*/

THREE.PixelBoxScene.prototype.populateWith = function(sceneDef, options){
	if(!sceneDef){
		console.log("PixelBoxScene.populateWith called with sceneDef = ",sceneDef);
		console.log("Make sure that the name of scene in sceneDef matches the name of the file loaded with PixelBoxAssets.loadAssets(...)\nCurrently loaded assets: ", assets.cache.files);
		return;
	}

	function value(obj, name, defaultVal){ if(!obj || obj[name] === undefined) return defaultVal; return obj[name]; }

	// config
	this.clearColor = parseInt(value(sceneDef, 'clearColor', '0'), 16);
	
	this.fog.color.set(parseInt(value(sceneDef, 'fogColor', '0'), 16));
	this.fog.near = value(sceneDef, 'fogNear', 100000);
	this.fog.far = value(sceneDef, 'fogFar', 10000000);
	
	this.ambientLight.color.set(parseInt(value(sceneDef, 'ambient', '0'), 16));
	
	// add assets to cache if needed
	for(var i in sceneDef.assets){
		var asset = sceneDef.assets[i];
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
		} else {
			asset = _.deepClone(asset, 100);
		}
		
		// already loaded
		if(assets.cache.get(asset.name)) continue;
		
		// save reference
		asset.includedWithScene = this;
		
		// add asset to cache if needed
		assets.cache.add(asset.name, asset);
	}
	
	options = options ? options : {};
	this.templates = options.templates = sceneDef.templates;

	// populate scene
	var addedObjects = this.populateObject(this, sceneDef.layers ? sceneDef.layers : [], options);

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
		this.add(sun);
		this.placeHolderLights.push(sun);
		maxShadows--;
	}
	
	// link up objects targets
	this.linkObjects(addedObjects, this);
};

/* 
	
	populateObject(object, layers [, options]) - populates object from layers definition
	
	returns an array of all objects created
	
	parameters:
	
	(Object3D) object - parent to add generated objects to or null
	(Array) layers - definitions of child objects to add
	(Object) options - (optional) object specifying options
		
			(Function) makeObject(objDef) - (optional callback)
				called before every object is created, or upcycled.
				* Return an Object3D to override this object with your own 
					(note that populateObject will still populate/initialize according to the definiton)
				* Return null to let object be created normally (default behavior)
				* Return -1 to skip creating this object altogether

			(Function) initObject(obj3d, objDef) - (optional callback)
				called after an object has been created and initialized with the definition.
				You can do additional initialization for the object in this callback.
			
			(Object) templates - templates used in the scene to create Instances from

		Additional options used by scene editor:
		
			(BOOL) helpers - create THREE.*Helper for lights and camera
			(BOOL) keepSceneCamera - don't override scene's camera with one in sceneDef
			(BOOL) wrapTemplates - wraps instances in Object3D container
			(BOOL) noNameReferences - don't create object[name] references in parent
			(BOOL) skipProps - passes skipProps parameter to linkObjects call to skip def.props parsing 
	
*/

THREE.PixelBoxScene.prototype.populateObject = function(object, layers, options){
	var degToRad = Math.PI / 180;
	var objectsCreated = [];
	options = options ? options : {};
	
	// create layers
	for(var i = 0; i < layers.length; i++){
		var layer = layers[i];
		// construct object
		var obj3d = null;
		//var prevObj3d = null;
		var helper = null;
		
		// try to get an object of the same type from pool
		if(options.makeObject) obj3d = options.makeObject(layer);
		if(obj3d === -1) continue;
		if(!obj3d && layer.asset != 'Instance') obj3d = this.upcycle(layer.asset);
		//prevObj3d = obj3d;
		
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
						obj3d.isInstance = true;
						obj3d.isTemplate = false;
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
						obj3d.isInstance = true;
						obj3d.isTemplate = false;
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
			
			break;
			
		case 'Camera':
			if(!obj3d) obj3d = new THREE.PerspectiveCamera(60, 1, 1, 1000);
			if(layer.fov != undefined) obj3d.fov = layer.fov;
			if(layer.near != undefined) obj3d.near = layer.near;
			if(layer.far != undefined) obj3d.far = layer.far;
			obj3d.isDefault = layer.isDefault ? true : false;
			if(!options.keepSceneCamera && obj3d.isDefault){
				if(this.camera && this.camera.parent) this.camera.parent.remove(this.camera);
				this.camera = obj3d;
				//console.log(obj3d);
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
				if(!obj3d) obj3d = new THREE.OrthographicCamera(-w,w,h,-h,1,1000);
			}
			if(layer.zoom != undefined){
				obj3d.zoom = layer.zoom;
				obj3d.updateProjectionMatrix();
			}
			if(layer.isDefault && (this instanceof THREE.PixelBoxScene) && !this.camera.def) { 
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
		    obj3d.shadowCameraNear = (layer.shadowNear != undefined ? layer.shadowNear : 1);
			obj3d.shadowCameraFar = (layer.shadowFar != undefined ? layer.shadowFar : 10000);
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
		    obj3d.shadowCameraNear = (layer.shadowNear != undefined ? layer.shadowNear : 1);
			obj3d.shadowCameraFar = (layer.shadowFar != undefined ? layer.shadowFar : obj3d.distance);
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
			if(layer.distance != undefined) obj3d.distance = layer.distance;
			if(layer.exponent != undefined) obj3d.exponent = layer.exponent;
			if(layer.angle != undefined){
				obj3d.angle = layer.angle * degToRad;
				obj3d.shadowCameraFov = layer.angle * 2;
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
		case 'LinePath':
			if(!obj3d) obj3d = new THREE.LinePath();
			obj3d.initialize(layer, options);				
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
		if(!obj3d.parent && object) { 
			// add to anchor, if specified
			if(layer.anchor && object.anchors){
				object.anchors[layer.anchor].add(obj3d);
			// otherwise to object itself
			} else {
				object.add(obj3d);
			}				
			obj3d.anchored = layer.anchor ? layer.anchor : false;
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
		if(layer.name && !options.noNameReferences && object){
			if(!object[layer.name]) {
				object[layer.name] = obj3d;
			// if already have one with that name
			} else {
				//console.log("skipped "+layer.name+" - already added to scene");
				if(layer.name != 'camera' || (layer.name == 'camera' && !(obj3d instanceof THREE.Camera)) ) console.log("Warning: ",object,"["+layer.name+"] already exists. Overwriting.");
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

		// callback
		if(options.initObject) options.initObject(obj3d, layer);
	}
	
	return objectsCreated;
};

/* generates geometry for 'Geometry' object during populateObject */
THREE.PixelBoxScene.prototype.makeGeometryObject = function(layer){
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
		if(!layer.inverted)
			geom = new THREE.PlaneBufferGeometry(layer.width, layer.height,layer.widthSegments, layer.heightSegments);
		else
			geom = new THREE.PlaneGeometry(layer.width, layer.height,layer.widthSegments, layer.heightSegments);

		break;
	}
	
	// flip normals
	if(layer.inverted){
		for ( var i = 0; i < geom.faces.length; i ++ ) {
		    var face = geom.faces[ i ];
		    var temp = face.a;
		    face.a = face.c;
		    face.c = temp;
		}
		
		geom.computeFaceNormals();
		geom.computeVertexNormals();
		
		var faceVertexUvs = geom.faceVertexUvs[ 0 ];
		for ( var i = 0; i < faceVertexUvs.length; i ++ ) {
		    var temp = faceVertexUvs[ i ][ 0 ];
		    faceVertexUvs[ i ][ 0 ] = faceVertexUvs[ i ][ 2 ];
		    faceVertexUvs[ i ][ 2 ] = temp;
		}
	}
	
	return geom;
};

/* links "#targetName.$anchorname.targetName" style references to objects in the hierarchy
	Used by Spot and Direct lights 
	*/
THREE.PixelBoxScene.prototype.linkObjects = function(objs, top, skipProps){
	
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
		this.updateMaterials = this.updateLights = this.updateLights || (obj instanceof THREE.Light);
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
				} else {
					obj[propName] = propVal;
				}
			}
		}
	}
	
};

/* ================================================================================ Scene unloading */

/* 
	Prepares the scene to be garbage collected.
	
	Clears object recycle pool and unloads assets that were loaded with the scene definition.
	
	Assets that persist between scenes should be loaded with assets.loadAssets,
	and assets that only exist in a scene as part of scene definition should be part of sceneDef
	
*/		
THREE.PixelBoxScene.prototype.dispose = function(unloadAssets){
	// remove all children
	this.recycle(this.children.concat());
	
	// clear object pool
	for(var otype in this.objectPool){
		var objects = this.objectPool[otype];
		for(var i = 0, l = objects.length; i < l; i++){
			var obj = objects[i];
			if(obj['dispose']) obj.dispose();
		}
		delete this.objectPool[otype];
	}
	
	if(unloadAssets){
		// clean up assets that were loaded with this scene
		for(var aname in assets.cache.files){
			var asset = assets.cache.files[aname];
			if(asset.frameData && asset.includedWithScene == this){
				THREE.PixelBoxUtil.dispose(asset);
				delete assets.cache.files[aname];
			}
		}
	}
};

/* ================================================================================ THREE.PixelBoxRenderer callbacks */

THREE.PixelBoxScene.prototype.addResizeListener = function(){
	$(window).on('resize.'+(this.constructor.name ? this.constructor.name : "PixelBoxScene"), this.onResized.bind(this));
};

THREE.PixelBoxScene.prototype.removeResizeListener = function(){
	$(window).off('resize.'+(this.constructor.name ? this.constructor.name : "PixelBoxScene"));
};

/* render callback */
THREE.PixelBoxScene.prototype.render = function( delta, rtt ) {
	this.tick(delta);
	
	// remove maxShadows placeholders
	if(this.placeHolderLights){
		for(var i = 0; i < this.placeHolderLights.length; i++){
			this.remove(this.placeHolderLights[i]);
		}
		this.recycle(this.placeHolderLights);
		this.placeHolderLights = null;
		this.updateLights = true;
	}
	
	if(this.updateLights || this.updateMaterials){
		THREE.PixelBoxUtil.updateLights(this, this.updateMaterials);
		this.updateLights = false;
		this.updateMaterials = false;
	}
	
	renderer.webgl.setClearColor( this.clearColor, 1);
	
	if(this.useComposer){
		this.composer.screenPass.renderToScreen = !rtt;
		this.composer.render(delta);
	} else {
		if (rtt) renderer.webgl.render( this, this.camera, this.fbo, true );
		else renderer.webgl.render( this, this.camera );
	}
	
};

/* resize callback */
THREE.PixelBoxScene.prototype.onResized = function(){
	this.camera.aspect = renderer.webgl.domElement.width / renderer.webgl.domElement.height;
	this.camera.updateProjectionMatrix();
	var renderTargetParameters = { 
		minFilter: THREE.NearestFilter,//THREE.LinearFilter, 
		magFilter: THREE.NearestFilter,//THREE.LinearFilter, 
		format: THREE.RGBFormat, 
		stencilBuffer: false };
	this.fbo = new THREE.WebGLRenderTarget( renderer.webgl.domElement.width, 
											renderer.webgl.domElement.height, renderTargetParameters );
	
	if(this.useComposer){
		this.composer.screenPass.onResized();	
		this.composer.reset(this.fbo);
	}
};

// end THREE.PixelBoxScene class

/* ================================================================================ THREE.Object3D extensions */

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

/* another can be an array or a single object */
THREE.Object3D.prototype.isDescendantOf = function(another){
	if(!this.parent) return false;
	if(_.isArray(another)){
		for(var i = 0, l = another.length; i < l; i++){
			var ai = another[i];
			if(this.parent == ai) return true;
			var p = this.parent.isDescendantOf(ai);
			if(p) return true;
		}
		return false;
	} else {
		if(this.parent == another) return true;
		return this.parent.isDescendantOf(another);
	}
}

/* if object is a descendent of an instance, returns that instance */
THREE.Object3D.prototype.parentInstance = function(){
	if(this.isInstance) return this;
	if(!this.parent) return null;
	return this.parent.parentInstance();
};

/* if object is a descendent of a template, returns that template */
THREE.Object3D.prototype.nearestTemplate = function(){
	if(this.isTemplate) return this;
	return this.nearestParentWithProperty('isTemplate', true);
};

/* 
   removes / dismantles object hierarchy (skips objects in omit array and doesn't remove anchors)
   returns all objects affected
   
   used when recycling objects
*/

THREE.Object3D.prototype.recursiveRemoveChildren = function(omit){
	var removedChildren = [];
	for(var i = this.children.length - 1; i >= 0; i--){
		var child = this.children[i];
		if(omit && omit.indexOf(child) !== -1){
			continue;
		}
		
		removedChildren = removedChildren.concat(child.recursiveRemoveChildren(omit));
		if(child.stopTweens) child.stopTweens();
		if(child.stopAnim) child.stopAnim();
		if(child['name']){
			if(child.anchored && this.parent[child.name] && this.parent[child.name] == child) {
				delete this.parent[child.name];
			} else if(this[child.name] == child){
				delete this[child.name];
			}
		}
		
		if(!child.isAnchor) { 
			this.remove(child);
			removedChildren.push(child);
		}
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

THREE.Object3D.prototype.removeFromParent = function(){
	if(!this.parent) return false;
	this.parent.remove(this);
	return true;
};

THREE.Object3D.prototype.lookAtObject = function(other){
	var objWorldPosition = other.parent ? other.parent.localToWorld(other.position.clone()) : other.position.clone();
	this.lookAt(this.parent ? this.parent.worldToLocal(objWorldPosition) : objWorldPosition);
};

THREE.Object3D.prototype.transplant = function(newParent){
	if(newParent.isDescendantOf(this)){
		console.error("Can't transplant this object to its descendant.");
		return;
	}
	// convert transform to world
	//this.updateMatrixWorld(true);
	this.matrix.copy(this.matrixWorld);
	this.matrix.decompose( this.position, this.quaternion, this.scale );
	this.rotation.setFromQuaternion(this.quaternion);
	// parent to new parent
	//newParent.updateMatrixWorld(true);
	var inv = new THREE.Matrix4();
	inv.getInverse(newParent.matrixWorld);
	inv.multiply(this.matrix);
	this.matrix.copy(inv);
	// refresh pos/rot/sc
	this.matrix.decompose( this.position, this.quaternion, this.scale );
	this.rotation.setFromQuaternion(this.quaternion);
	
	newParent.add(this);	
};

/* ================================================================================ Util */

/*

	Linepath represents a transformable path
	
*/

THREE.LinePath = function(){
	
	THREE.Line.call(this, new THREE.Geometry(), THREE.LinePath.prototype.sharedMaterial);
	
	this.path = new THREE.CurvePath();
	
	this.type = THREE.LineStrip;
	
	return this;
};

THREE.LinePath.prototype = Object.create(THREE.Line.prototype);
THREE.LinePath.prototype.constructor = THREE.LinePath;

/* creates the segments from definition */
THREE.LinePath.prototype.initialize = function(objDef){
	var lastPoint = null, srg, curve;
	for(var i = 0, l = objDef.segments.length; i < l; i++){
		seg = objDef.segments[i];

		curve = new THREE.CubicBezierCurve3(
			lastPoint ? lastPoint : (new THREE.Vector3()).fromArray(seg.v0),
			(new THREE.Vector3()).fromArray(seg.v1),
			(new THREE.Vector3()).fromArray(seg.v2),
			(new THREE.Vector3()).fromArray(seg.v3)
		);

		curve.v0.lockTangents = (seg.v0.length > 3);
		curve.v3.lockTangents = (seg.v3.length > 3);
		curve.v0.meta = curve.v0.meta ? curve.v0.meta : seg.metaStart;
		curve.v3.meta = seg.metaEnd;

		lastPoint = curve.v3;

		this.path.add(curve);
	}
	
	this.isLoop = this.path.curves[0].v0.equals(this.path.curves[this.path.curves.length - 1].v3);

};

/* overridden, to save lastGetPointCurveIndex */
THREE.LinePath.prototype.getPoint = function(t){
	var d = t * this.path.getLength();
	var curveLengths = this.path.getCurveLengths();
	var i = 0, diff, curve;
	while ( i < curveLengths.length ) {
		if ( curveLengths[ i ] >= d ) {
			diff = curveLengths[ i ] - d;
			curve = this.path.curves[ i ];
			var u = 1 - diff / curve.getLength();
			this.lastGetPointCurveIndex = i;
			return curve.getPointAt( u );
		}
		i ++;
	}
	return null;
};

/* reverses path direction */
THREE.LinePath.prototype.reverse = function(){
	this.path.curves.reverse();
	for(var i = 0, nc = this.path.curves.length; i < nc; i++){
		var curve = this.path.curves[i];
		var temp = curve.v0;
		curve.v0 = curve.v3;
		curve.v3 = temp;
		temp = curve.v1;
		curve.v1 = curve.v2;
		curve.v2 = temp;
	}
	if(this.path.cacheLengths) this.path.cacheLengths.length = 0;
};

/* tweens */
THREE.LinePath.prototype.applyTween = function(tweenObj){
	
	var valueChange = tweenObj.to - tweenObj.from;
	var t = tweenObj.easing(tweenObj.time, tweenObj.from, valueChange, tweenObj.duration);
	
	// global position at t
	var modt = t % 1.0;
	var pos = this.getPoint(modt);
	var delta = Math.sign(valueChange) * 0.0001;
	this.localToWorld(pos);
	
	// detect curve change
	var meta1 = null;
	var meta2 = null;
	if(this.lastGetPointCurveIndex != tweenObj.currentCurveIndex){
		var curve = this.path.curves[this.lastGetPointCurveIndex];
		var prevCurve = tweenObj.currentCurveIndex !== undefined ? this.path.curves[tweenObj.currentCurveIndex] : null;
		tweenObj.currentCurveIndex = this.lastGetPointCurveIndex;
		if(valueChange > 0){
			if(curve.v0.meta) meta1 = curve.v0.meta;
			if(prevCurve && prevCurve.v3.meta && prevCurve.v3 != curve.v0) meta2 = prevCurve.v3.meta;
		} else {
			if(curve.v3.meta) meta1 = curve.v3.meta;
			if(prevCurve && prevCurve.v0.meta && prevCurve.v0 != curve.v3) meta2 = prevCurve.v0.meta;
		}
	}
	
	if(meta1){
		if(tweenObj.meta) tweenObj.meta.call(this, tweenObj, meta1);
		var ev = {type:'path-meta', tweenObject: tweenObj, meta: meta1};
		tweenObj.target.dispatchEvent(ev);
		this.dispatchEvent(ev);
		ev = null;
	}
	if(meta2){
		if(tweenObj.meta) tweenObj.meta.call(this, tweenObj, meta2);
		var ev = {type:'path-meta', tweenObject: tweenObj, meta: meta2};
		tweenObj.target.dispatchEvent(ev);
		this.dispatchEvent(ev);
		ev = null;
	}
	
	var targetParent = tweenObj.target.parent;
	if(targetParent){
		tweenObj.target.parent.worldToLocal(pos);
	}
	
	// set position
	tweenObj.target.position.copy(pos);
	
	// orient to path
	var incTime = modt + delta;
	if(tweenObj.orientToPath && incTime > 0 && (this.isLoop || incTime <= 1.0)){
		var tangent = this.getPoint(incTime % 1.0);
		this.localToWorld(tangent);
		
		if(targetParent){
			targetParent.worldToLocal(tangent);
		}
		
		tweenObj.target.lookAt(tangent);
	}
};

THREE.LinePath.prototype.tween = function(obj){
	var objs;
	if(!_.isArray(obj)) objs = [obj];
	else objs = obj.concat();
	
	for(var i = objs.length - 1; i >= 0; i--){
		var tweenObj = objs[i];
		
		if(tweenObj.target === undefined) {
			console.log("tween object \'target\' parameter is missing: ", tweenObj);
			objs.splice(i, 1);
			continue;
		} else if(!(tweenObj.target instanceof THREE.Object3D)){
			console.log("tween object \'target\' must be a descendant of THREE.Object3D: ", tweenObj);
			objs.splice(i, 1);
			continue;
		} if(this.isDescendantOf(tweenObj.target)){
			console.log("tween object \'target\' must not be a parent/ascendant of this THREE.LinePath instance: ", tweenObj);
			objs.splice(i, 1);
			continue;
		}

	}	
	
	return THREE.Object3D.prototype.tween.call(this, objs);
};

/* ================================================================================ Util */

/* pseudo - random number */
Math.seededRandom = function(seed) {
	var x = Math.sin(seed+1) * 10000;
	return x - Math.floor(x);
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









