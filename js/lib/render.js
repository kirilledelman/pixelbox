function Renderer(){

	this.scene = null;
	this.webgl = null;
	this.clock = new THREE.Clock();
	this.paused = false;
	
	/* init */
	this.init = function(scale){
		// check webgl support
		var webgl = false;
		try { 
			var canvas = document.createElement('canvas'); 
			webgl = !! window.WebGLRenderingContext && ( canvas.getContext( 'webgl' ) || canvas.getContext( 'experimental-webgl' ) );
		} catch(e) {}
		if(!webgl) return false;
	
		this.scale = 1.0 / (scale != undefined ? scale : 1.0);
		
		// create renderer
		this.webgl = webgl = new THREE.WebGLRenderer({devicePixelRatio:1.0, antialias: false, autoClear: false, alpha: false, maxLights:16, preserveDrawingBuffer: false, precision:'highp' });//0.5 for double
		document.body.appendChild(webgl.domElement);
		webgl.updateStyle = false;
		webgl.setSize(window.innerWidth * this.scale, window.innerHeight * this.scale);
		
	    // shadowing
	    webgl.shadowMapEnabled = true;
	    webgl.sortObjects = false;
	    /*if(window['olderDevice'] != undefined){ // ios hook
			webgl.shadowMapSoft = !window['olderDevice'];
			webgl.shadowMapType = window['olderDevice'] ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
	    } else {
			webgl.shadowMapSoft = true;
			webgl.shadowMapType = THREE.PCFSoftShadowMap;
	    }*/	    
	    webgl.shadowMapSoft = false;
		webgl.shadowMapType = THREE.BasicShadowMap;
		//webgl.shadowMapSoft = true;
		//webgl.shadowMapType = THREE.PCFSoftShadowMap;
		
		// default transition params
		this.transitionParams = {
			textureThreshold: 0.5,
			transitionSpeed: 0.4,
			useTexture: true
		}
		
		/*var stats = this.stats = new Stats();
		stats.domElement.style.position = 'absolute';
		stats.domElement.style.bottom = '0px';
		stats.domElement.style.right = '0px';
		stats.domElement.style.zIndex = 100;
		document.body.appendChild( stats.domElement );
		this.stats = stats;*/
		
		// window resized listener
		$(window).on('resize.renderer',this._windowResized);
		$('canvas').css({ width:window.innerWidth, height:window.innerHeight });
			
		// start render loop
		this._render();
		
		return true;
	}

	/* scene transition 
		omit transType for instant transition
		otherwise transType = number between 1 and 2
	*/
	this.setScene = function(newScene, transType){
		this.currentScene = newScene;
		
		// ignore if the same scene
		if(transType != undefined && (((this.scene instanceof Transition) && this.scene.sceneB == newScene && transType != 0) || this.scene == newScene)) { 
			console.log("Same scene");
			return;
		}
	
		// check if size changed
		/*if(newScene.fbo && 
			(newScene.fbo.width != window.innerWidth * this.scale || newScene.fbo.height != window.innerHeight * this.scale) &&
			newScene.onResized) newScene.onResized();*/
	
		// with transition
		if(transType != undefined && transType > 0){
			// add a blank scene if was empty
			if(!this.scene) this.scene = new EmptyScene();
			// if transition is in progress finish current first
			else if(this.scene instanceof Transition){
				this.setScene(this.scene.sceneB, 0);
			}
			
			if(newScene['onWillAdd']) newScene.onWillAdd();
			
			// notify scene that it will be removed
			if(this.scene['onWillRemove']){
				this.scene.onWillRemove();
			}
			
			// do a transition
			if(this.transitionScene){
				this.transitionScene.init(this.scene, newScene);
			} else {
				this.transitionScene = new Transition(this.scene, newScene);
			}
			this.transitionScene.useTexture(transType > 0);
			this.transitionScene.setTexture(transType - 1); // 0-based
			this.transitionScene.setTextureThreshold(this.transitionParams.textureThreshold);
			this.transitionScene.onTransitionComplete = function(s){ renderer.setScene(s, 0); }
			this.scene = this.transitionScene;
			
		// without transition
		} else {
			// notify old scene that it's removed
			if((this.scene instanceof Transition) && this.scene.sceneA && this.scene.sceneA['onRemoved']){
				this.scene.sceneA.onRemoved();
				this.scene.sceneA = undefined;
			} else if(this.scene && this.scene['onRemoved']){
				if(transType == undefined && this.scene['onWillRemove']) this.scene.onWillRemove();
				this.scene.onRemoved();
			}
		
			// set new scene
			this.scene = newScene;
			
			// refresh shadowMapPlugin
			/*this.webgl.renderPluginsPre.length = 0;
			delete this.webgl.shadowMapPlugin;
			this.webgl.shadowMapPlugin = new THREE.ShadowMapPlugin();
			this.webgl.addPrePlugin(this.webgl.shadowMapPlugin);*/
			
			// callback when scene transition is complete
			if(transType == undefined && newScene['onWillAdd']) newScene.onWillAdd();
			if(newScene['onAdded']) newScene.onAdded();
		}
	}

	/* render */
	this._render = function() {
		//renderer.stats.update();
		if(!renderer.paused) requestAnimationFrame(renderer._render);
		
		var deltaTime = renderer.clock.getDelta();
		
		if(renderer.scene){ // assumes Transition or Scene
			renderer.scene.render(deltaTime);
		}
	}

	/* window resized callback */
	this._windowResized = function(){
		// notify the renderer of the size change
		renderer.webgl.setSize(window.innerWidth * renderer.scale, window.innerHeight * renderer.scale);
		
		// fill screen
		$('canvas').css({ width:window.innerWidth, height:window.innerHeight });
	};

	/* pause rendering when app is inactive */
	this.pause = function(p){
		this.paused = p;
		this.clock.getDelta();
		this._render();
	};
}

/* empty generic scene for transition */
function EmptyScene(){
	this.clearColor = 0x0;
	this.camera = new THREE.PerspectiveCamera(70, 1.0, 0.1, 10000 );
	// setup scene
	this.scene = new THREE.Scene();
	// create render target
	var renderTargetParameters = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat, stencilBuffer: false };
	this.fbo = new THREE.WebGLRenderTarget( window.innerWidth * renderer.scale, window.innerHeight * renderer.scale, renderTargetParameters );
}

EmptyScene.prototype = {
	onWillAdd:function(){},
	onAdded:function(){},
	onWillRemove:function(){}, // called before this scene will be transitioned away
	onRemoved:function(){}, // called before the scene is destroyed
	onResized:function(){},// called by renderer's window resize callback
	render:function( delta, rtt ) {
		renderer.webgl.setClearColor( this.clearColor, 1 );
		if (rtt) renderer.webgl.render( this.scene, this.camera, this.fbo, true );
		else renderer.webgl.render( this.scene, this.camera );
	}
};

/* transition scene */
function Transition ( sa, sb ) {

	this.scene = new THREE.Scene();
	
	this.cameraOrtho = new THREE.OrthographicCamera(renderer.scale * window.innerWidth / -2, renderer.scale * window.innerWidth / 2,
													renderer.scale * window.innerHeight / 2, renderer.scale * window.innerHeight / -2, -10, 10);

	this.textures = [];
	for (var i=0;i<2;i++){
		this.textures[i] = assets.cache.get('textures/transition/transition'+(i+1)+'.png');
	}
	this.quadmaterial = new THREE.ShaderMaterial({

		uniforms: {
			tScale: { type: "v2", value: new THREE.Vector2(1, 1) },
			
			tDiffuse1: {
				type: "t",
				value: null
			},
			tDiffuse2: {
				type: "t",
				value: null
			},
			mixRatio: {
				type: "f",
				value: 0.0
			},
			threshold: {
				type: "f",
				value: 0.1
			},
			useTexture: {
				type: "i",
				value: 1,
			},
			tMixTexture: {
				type: "t",
				value: this.textures[0]
			}
		},
		vertexShader: [

			"varying vec2 vUv;",

			"void main() {",

			"vUv = vec2( uv.x, uv.y );",
			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

			"}"

		].join("\n"),
		fragmentShader: [

			"uniform float mixRatio;",
			"uniform vec2 tScale;",

			"uniform sampler2D tDiffuse1;",
			"uniform sampler2D tDiffuse2;",
			"uniform sampler2D tMixTexture;",
			
			"uniform int useTexture;",
			"uniform float threshold;",

			"varying vec2 vUv;",

			"void main() {",

			"vec4 texel1 = texture2D( tDiffuse1, vUv );",
			"vec4 texel2 = texture2D( tDiffuse2, vUv );",
			
			"if (useTexture==1) {",
				
				"vec4 transitionTexel = texture2D( tMixTexture, vec2(0.5 + (vUv.x - 0.5) * tScale.x, 0.5 + (vUv.y - 0.5) * tScale.y) );",
				"float r = mixRatio * (1.0 + threshold * 2.0) - threshold;",
				"float mixf=clamp((transitionTexel.r - r)*(1.0/threshold), 0.0, 1.0);",
				
				"gl_FragColor = mix( texel2, texel1, mixf );",
			"} else {",
				
				"gl_FragColor = mix( texel2, texel1, mixRatio );",
				
			"}",
		"}"

		].join("\n")

	});		

	quadgeometry = new THREE.PlaneBufferGeometry(window.innerWidth, window.innerHeight);
	
	this.quad = new THREE.Mesh(quadgeometry, this.quadmaterial);
	this.scene.add(this.quad);

	this.init = function(fromScene, toScene){
		this.onTransitionComplete = null;
		this.time = 0;
		
		// Link both scenes and their FBOs
		this.sceneA = fromScene;
		this.sceneB = toScene;
	
		this.quadmaterial.uniforms.tDiffuse1.value = fromScene.fbo;
		this.quadmaterial.uniforms.tDiffuse2.value = toScene.fbo;
		
		var ww = window.innerWidth * renderer.scale;
		var hh = window.innerHeight * renderer.scale;
		this.quadmaterial.uniforms.tScale.value.set(
			Math.min(ww / hh, 1),
			Math.min(hh / ww, 1)			
		);
	}
	this.init(sa, sb);
	
	this.setTextureThreshold = function ( value ) {
		this.quadmaterial.uniforms.threshold.value=value;
	}
	
	this.useTexture = function ( value ) {
		this.quadmaterial.uniforms.useTexture.value = value?1:0;
	}
	
	this.setTexture = function ( i ) {
		this.quadmaterial.uniforms.tMixTexture.value = this.textures[i];
	}
	
	this.render = function( delta ) {
		var transitionParams = renderer.transitionParams;
		
		// Transition animation
		this.time += delta;
		this.smoothTime = THREE.Math.smoothstep(this.time * transitionParams.transitionSpeed,0.2,0.8);
		this.quadmaterial.uniforms.mixRatio.value = this.smoothTime;

		// Prevent render both scenes when it's not necessary
		if (this.smoothTime == 0) {
			this.sceneA.render( delta, false );
		} else if (this.smoothTime == 1) {
			this.sceneB.render( delta, false );
			// on complete
			if(this.onTransitionComplete){
				this.onTransitionComplete(this.sceneB);
			}
		} else {
			// When 0<transition<1 render transition between two scenes
			this.quadmaterial.uniforms.tDiffuse1.value = this.sceneA.fbo;
			this.quadmaterial.uniforms.tDiffuse2.value = this.sceneB.fbo;

			this.sceneA.render( delta, true );
			this.sceneB.render( delta, true );
			renderer.webgl.render( this.scene, this.cameraOrtho, null, true );
		}

	}
}

var renderer = new Renderer();
