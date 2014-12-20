/*

Notes

add "transplant" method
var position = new THREE.Vector3();
var quaternion = new THREE.Quaternion();
var scale = new THREE.Vector3();
mesh.updateMatrixWorld( true );
mesh.matrixWorld.decompose( position, quaternion, scale );



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
	populateWith:function(sceneDef){
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
		
		// prepare maxShadows placeholders
		var numShadows = 0;
		var addedObjects = this.populateObject(this.scene, sceneDef.layers);
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
		
		// update camera viewport
		THREE.PixelBox.prototype.updateViewPortUniform(null);
	},
	
	/* removes maxShadows placeholders */
	removePlaceHolderLights:function(){
		for(var i = 0; i < this.placeHolderLights.length; i++){
			this.scene.remove(this.placeHolderLights[i]);
		}
		this.putObjectsToPool(this.placeHolderLights);
		this.placeHolderLights.length = 0;
		this.placeHolderLights = null;
		
		THREE.PixelBox.updateLights(this.scene, true);
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
			if(layer.name && !options.noNameReferences){
				if(object[layer.name]){
					obj3d = object[layer.name];
				}
			}
			
			// try to get an object of the same type from pool
			var objType = (typeof(layer.asset) == 'string') ? layer.asset : (this.assets[layer.asset].name);
			if(!obj3d) obj3d = this.getObjectFromPool(objType);
			prevObj3d = obj3d;
			
			// Special types of layers - lights, etc
			switch(layer.asset){
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
				obj3d = new THREE.PerspectiveCamera(60, 1, 1, 1000);
				if(layer.fov != undefined) obj3d.fov = layer.fov;
				if(layer.near != undefined) obj3d.near = layer.near;
				if(layer.far != undefined) obj3d.far = layer.far;
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
				if(layer.target != undefined){
					if(typeof(layer.target) == 'string' && object.anchors && object.anchors[layer.target]) obj3d.target = object.anchors[layer.target];
					else if(layer.target.length == 3){// array of world pos
						obj3d.target.position.set(layer.target[0],layer.target[1],layer.target[2]);
					}
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
				if(layer.target != undefined){
					if(typeof(layer.target) == 'string' && object.anchors && object.anchors[layer.target]) obj3d.target = object.anchors[layer.target];
					else if(layer.target.length == 3){// array of world pos
						obj3d.target.position.set(layer.target[0],layer.target[1],layer.target[2]);
					}
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
			case 'Plane':
				if(!obj3d) {
					var geom = new THREE.PlaneBufferGeometry(1,1,2,2);
					var mat = new THREE.MeshPixelBoxMaterial({ color: new THREE.Color(layer.color != undefined ? parseInt(layer.color,16) : 0xffffff) });
					obj3d = new THREE.Mesh(geom, mat);
				} else {
					obj3d.material.color = (layer.color != undefined ? parseInt(layer.color, 16) : 0xffffff);
				}
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
			obj3d.def = layer;
			
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
					if(obj3d.pointSize != undefined){
						obj3d.pointSize = (obj3d.geometry.data.pointSize || 1.0) * layer.scale;
					}
				}
			} else {
				obj3d.scale.set(1,1,1);
				if(obj3d instanceof THREE.PointCloud) obj3d.pointSize = obj3d.geometry.data.pointSize;
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
			if(obj3d instanceof THREE.PointCloud){
				if(layer.pointSize != undefined) { 
					obj3d.pointSize = layer.pointSize;
				} else {
					var maxScale = Math.max(obj3d.scale.x, obj3d.scale.y, obj3d.scale.z);
					obj3d.pointSize = maxScale + 0.1;
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
					
					if(animOption == 'gotoAndStop'){
						obj3d.gotoAndStop(layer.animName, animFrame);
					} else if(animOption == 'loopAnim'){
						obj3d.loopAnim(layer.animName, true);
					} else if(animOption == 'loopFrom') { 
						obj3d.gotoAndStop(layer.animName, animFrame); 
						obj3d.loopAnim(layer.animName,Infinity,true);
					} else if(animOption == 'playAnim') { 
						obj3d.playAnim(layer.animName);
					}
				}
				
				// re-add anchors if removed
				for(var a in obj3d.anchors){
					if(!obj3d.anchors[a].parent){
						obj3d.add(obj3d.anchors[a]);
					}
				}				
			}
			// add as a name reference
			if(layer.name){
				if(!object[layer.name]) {
					object[layer.name] = obj3d;
				// if already have one with that name
				} else {
					//console.log("skipped "+layer.name+" - already added to scene");
					object[layer.name] = obj3d;
				}
			}
			
			objectsCreated.push(obj3d);
			
			if(layer.isTemplate) obj3d.isTemplate = layer.isTemplate;
			
			// add templates for editor
			if(layer.containsTemplates && options.templates){
				for(var ti = 0; ti < layer.containsTemplates.length; ti++){
					var td = options.templates[layer.containsTemplates[ti]];
					if(td) objectsCreated = objectsCreated.concat(this.populateObject(obj3d, [ options.templates[layer.containsTemplates[ti]] ], options));
				}
			}
			// recursively process children
			if(layer.layers){
				objectsCreated = objectsCreated.concat(this.populateObject(obj3d, layer.layers, options));
			}
			
		}
		
		return objectsCreated;
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
			if(obj3d instanceof THREE.PointCloud){
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

THREE.Object3D.prototype.isVisibleRecursive = function(){
	if(!this.visible) return false;
	if(this.parent) return this.parent.isVisibleRecursive();
	return this.visible;	
}

THREE.Object3D.prototype.isDescendentOf = function(another){
	if(!this.parent) return false;
	if(this.parent == another) return true;
	return this.parent.isDescendentOf(another);
}

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