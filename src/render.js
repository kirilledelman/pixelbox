/*
 * @author Kirill Edelman
 * @source https://github.com/kirilledelman/pixelbox
 * @documentation https://github.com/kirilledelman/pixelbox/wiki
 * @license MIT
*/


THREE.PixelBoxRenderer = function () {

	this.scene = null;
	this.webgl = null;
	this.clock = new THREE.Clock();
	this.paused = false;
	
	/* init */
	this.init = function ( scale, stats ) {
		// check webgl support
		var webgl = false;
		var canvas;
		try {
		
			canvas = document.createElement( 'canvas' );
			webgl = !!window.WebGLRenderingContext && (canvas.getContext( 'webgl' ) || canvas.getContext( 'experimental-webgl' ));
			
		} catch( e ) {};
		
		if ( !webgl ) return false;
	
		this.scale = 1.0 / (scale != undefined ? scale : 1.0);
		
		// create renderer
		this.webgl = webgl = new THREE.WebGLRenderer( {	devicePixelRatio: 1.0, antialias: false, autoClear: false, 
														alpha: false, maxLights: 16, preserveDrawingBuffer: false, precision: 'highp' } );
														
		document.body.insertBefore( webgl.domElement, document.body.firstChild );
		webgl.updateStyle = false;
		webgl.setSize( window.innerWidth * this.scale, window.innerHeight * this.scale );
		
	    // shadowing
	    webgl.shadowMapEnabled = true;
	    webgl.sortObjects = false;
	    webgl.shadowMapSoft = false;
		webgl.shadowMapType = THREE.BasicShadowMap;

		// flipSided override for WebGLRenderer
		var _oldDoubleSided = false, _oldFlipSided = -1;
		webgl.setMaterialFaces =  function ( material ) {

			var doubleSided = material.side === THREE.DoubleSide;
			var flipSided = material.side === THREE.BackSide;

			// let material override its flipSided prop
			if ( typeof material.flipSided !== 'undefined' ) {

				flipSided = material.flipSided;

			}

			var _gl = this.context;

			//if ( _oldDoubleSided !== doubleSided ) {

				if ( doubleSided ) {

					_gl.disable( _gl.CULL_FACE );

				} else {

					_gl.enable( _gl.CULL_FACE );

				}

				_oldDoubleSided = doubleSided;

			//}

			//if ( _oldFlipSided !== flipSided ) {

				if ( flipSided ) {

					_gl.frontFace( _gl.CW );

				} else {

					_gl.frontFace( _gl.CCW );

				}

				_oldFlipSided = flipSided;

			//}

		}.bind( webgl );

		// default transition params
		this.transitionParams = {
			textureThreshold: 0.5,
			transitionDuration: 1,
			useTexture: false
		}
		
		// stats
		if ( stats ) {
		
			var stats = this.stats = new Stats();
			stats.domElement.style.position = 'absolute';
			stats.domElement.style.bottom = '0px';
			stats.domElement.style.right = '0px';
			stats.domElement.style.zIndex = 100;
			document.body.appendChild( stats.domElement );
			this.stats = stats;
			
		}
		
		// window resized listener
		window.addEventListener( 'resize', this._resizeCallback, true );
		canvas.style.width = window.innerWidth + 'px';
		canvas.style.height = window.innerHeight + 'px';
		
		// animation queue
		this.animQueue = new AnimQueue( 20 ); // max true fps for PixelBox animations

		// tween queue
		this.tweenQueue = new AnimQueue( false ); // false means we'll be calling .tick manually
		
		// start render loop
		this._render();
		
		return true;
		
	}

	/* 
		setScene(newScene [, transType [, duration]]);
	
		parameters:
			
			(PixelBoxScene) newScene - new scene to make current
			
			(*) transType - (optional) transition type.
							Omit this parameter for instant scene switch.
							Specify (THREE.Texture) texture for image transition.
							Specify (BOOL) true for blend transition.
							
			(Number) duration - (optional) duration of the transition - default is 1 sec
	*/
	this.setScene = function ( newScene, transType, duration ) {
	
		// ignore if the same scene
		if ( transType != undefined && (((this.scene instanceof THREE.PixelBoxSceneTransition) && this.scene.sceneB == newScene && transType != 0) || this.scene == newScene) ) { 
		
			console.log( "Same scene" );
			return;
			
		}
		
		var ww = this.webgl.domElement.width;
		var hh = this.webgl.domElement.height;
	
		// resize buffers if sizes changed
		if ( this.currentScene && this.currentScene.fbo && (this.currentScene.fbo.width != ww || this.currentScene.fbo.height != hh) && this.currentScene.onResized ) { 
				
			this.currentScene.onResized( true );
				
		}
		
		if ( newScene.fbo && (newScene.fbo.width != ww || newScene.fbo.height != hh) &&	newScene.onResized ) { 
				
			newScene.onResized( true );
				
		}
		
		// set current scene
		this.currentScene = newScene;
	
		// with transition
		if ( transType != undefined && transType !== 0 ) {
		
			if ( newScene[ 'onWillAdd' ] ) newScene.onWillAdd();
			
			// add a blank scene if was empty
			if ( !this.scene ) this.scene = new THREE.PixelBoxEmptyScene( newScene.clearColor );
			
			// if transition is in progress finish current first
			else if ( this.scene instanceof THREE.PixelBoxSceneTransition ) {
			
				this.setScene( this.scene.sceneB, 0 );
				
			}
			
			// notify scene that it will be removed
			if ( this.scene[ 'onWillRemove' ] ) {
			
				this.scene.onWillRemove();
				
			}
			
			// do a transition
			if ( this.transitionScene ) {
			
				this.transitionScene.init( this.scene, newScene );
				
			} else {
			
				this.transitionScene = new THREE.PixelBoxSceneTransition( this.scene, newScene );
				
			}
			
			if ( duration != undefined ) this.transitionParams.transitionDuration = duration;
			else this.transitionParams.transitionDuration = 1;
			
			if ( transType instanceof THREE.Texture ) {
			
				this.transitionScene.setTexture( transType );
				this.transitionScene.useTexture( true );
				
			} else {
			
				this.transitionScene.useTexture( false );
				
			}
			
			this.transitionScene.setTextureThreshold( this.transitionParams.textureThreshold );
			this.transitionScene.onTransitionComplete = function ( s ) { renderer.setScene( s, 0 ); }
			this.scene = this.transitionScene;
			
		// without transition
		} else {
		
			// notify old scene that it's removed
			if ( (this.scene instanceof THREE.PixelBoxSceneTransition) && this.scene.sceneA && this.scene.sceneA[ 'onRemoved' ] ) {
			
				this.scene.sceneA.onRemoved();
				this.scene.sceneA = undefined;
				
			} else if ( this.scene && this.scene[ 'onRemoved' ] ) {
			
				if ( transType == undefined && this.scene[ 'onWillRemove' ] ) this.scene.onWillRemove();
				this.scene.onRemoved();
				
			}
		
			// set new scene
			this.scene = newScene;
			
			// callback when scene transition is complete
			if ( transType == undefined ) { 
			
				if ( newScene[ 'onWillAdd' ] ) newScene.onWillAdd();
				
			}
			if ( newScene[ 'onAdded' ] ) newScene.onAdded();
		}
		
		window.dispatchEvent( new Event( 'resize' ) );
		
	}

	/* render */
	this._render = function () {

		if ( renderer.paused ) return;

		requestAnimationFrame( renderer._render );
		
		var deltaTime = renderer.clock.getDelta();
		
		renderer.tweenQueue.tick( deltaTime );
		
		if ( renderer.scene ) { // assumes Transition or Scene
		
			renderer.scene.render( deltaTime );
			
		}
		
		if ( renderer.stats ) renderer.stats.update();
		
	}

	/* window resized callback */
	this._resizeCallback = function( e ) {

		// fill screen
		renderer.webgl.domElement.style.width = window.innerWidth;
		renderer.webgl.domElement.style.height = window.innerHeight;

		// schedule a resize to prevent too many consequitive calls
		if ( !renderer.resizeTimeout ) {

			renderer.resizeTimeout = setTimeout( renderer._windowResized, 100 );

		}

	};

	this._windowResized = function () {

		renderer.resizeTimeout = 0;

		// notify the renderer of the size change
		renderer.webgl.setSize( Math.floor( window.innerWidth * renderer.scale ), Math.floor( window.innerHeight * renderer.scale ), false );
		renderer.webgl.domElement.style.width = window.innerWidth + 'px';
		renderer.webgl.domElement.style.height = window.innerHeight + 'px';

		// update PixelBox viewport uniform
		THREE.PixelBoxUtil.updateViewPortUniform();

		// call onResize callback
		if( renderer.scene ) renderer.scene.onResized( true );

	};

	/* pause rendering when app is inactive */
	this.pause = function ( p ) {
	
		this.paused = p;
		if ( p ) {

			this.clock.stop();

		} else {

			this.clock.start();

		}
		this.clock.getDelta();
		this._render();
		
	};
	
}

/* empty generic scene for transition */
THREE.PixelBoxEmptyScene = function ( clearColor ) {

	this.clearColor = clearColor != undefined ? clearColor : 0x0;
	this.camera = new THREE.PerspectiveCamera( 70, 1.0, 0.1, 10000 );
	
	// setup scene
	this.scene = new THREE.Scene();
	
	// create render target
	var renderTargetParameters = { 
		minFilter: THREE.NearestFilter, 
		magFilter: THREE.NearestFilter, 
		format: THREE.RGBFormat, 
		generateMipmaps: false,
		stencilBuffer: false,
		depthBuffer: false
	};
	
	this.fbo = new THREE.WebGLRenderTarget( renderer.webgl.domElement.width, renderer.webgl.domElement.height, renderTargetParameters );
	
}

THREE.PixelBoxEmptyScene.prototype = {
	constructor: THREE.PixelBoxEmptyScene,
	onWillAdd: function () {},
	onAdded: function () {},
	onWillRemove: function () {}, // called before this scene will be transitioned away
	onRemoved: function () {}, // called before the scene is destroyed
	onResized: function () {},// called by renderer's window resize callback
	render: function ( delta, rtt ) {
	
		renderer.webgl.setClearColor( this.clearColor, 1 );
		if ( rtt ) renderer.webgl.render( this.scene, this.camera, this.fbo, true );
		else renderer.webgl.render( this.scene, this.camera );
		
	}
};

/* transition scene, adopted from three.js examples */
THREE.PixelBoxSceneTransition = function ( sa, sb ) {

	this.scene = new THREE.Scene();
	
	this.cameraOrtho = new THREE.OrthographicCamera( renderer.webgl.domElement.width / -2, renderer.webgl.domElement.width / 2,
													 renderer.webgl.domElement.height / 2, renderer.webgl.domElement.height / -2, -1000, 1000 );
	this.scene.add( this.cameraOrtho );

	this.quadmaterial = new THREE.ShaderMaterial( {

		uniforms: {
			tScale: { type: "v2", value: new THREE.Vector2( 1, 1 ) },
			
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
				value: null
			}
		},
		
		vertexShader: [

			"varying vec2 vUv;",

			"void main() {",

			"vUv = vec2( uv.x, uv.y );",
			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

			"}"

		].join( "\n" ),
		
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
				
				"gl_FragColor = mix( texel1, texel2, mixRatio );",
				
			"}",
		"}"

		].join( "\n" )

	} );		

	this.init = function ( fromScene, toScene ) {
	
		this.onTransitionComplete = null;
		this.smoothTime = this.time = 0;
		
		// Link both scenes and their FBOs
		this.sceneA = fromScene;
		this.sceneB = toScene;
	
		this.quadmaterial.uniforms.tDiffuse1.value = fromScene.fbo;
		this.quadmaterial.uniforms.tDiffuse2.value = toScene.fbo;
		
		var ww = renderer.webgl.domElement.width;
		var hh = renderer.webgl.domElement.height;

		if ( fromScene.fbo.width != ww || fromScene.fbo.height != hh ) fromScene.onResized( true );
		if ( toScene.fbo.width != ww || toScene.fbo.height != hh ) toScene.onResized( true );

		if ( !this.quad ) {

			var quadgeometry = new THREE.PlaneBufferGeometry( 1, 1 );
			this.quad = new THREE.Mesh( quadgeometry, this.quadmaterial );
			this.scene.add( this.quad );

		}

		this.quad.scale.set( ww, hh, 1.0 );
		
		this.quadmaterial.uniforms.tScale.value.set(
			Math.min( ww / hh, 1 ),
			Math.min( hh / ww, 1 )			
		);
		
		this.cameraOrtho.left = ww / -2;
		this.cameraOrtho.right = ww / 2;
		this.cameraOrtho.top = hh / 2;
		this.cameraOrtho.bottom = hh / -2;
		this.cameraOrtho.updateProjectionMatrix();

	}
	
	this.init( sa, sb );
	
	this.setTextureThreshold = function ( value ) {
	
		this.quadmaterial.uniforms.threshold.value = value;
		
	}
	
	this.useTexture = function ( value ) {
	
		this.quadmaterial.uniforms.useTexture.value = value ? 1 : 0;
		
	}
	
	this.setTexture = function ( tex ) {
	
		this.quadmaterial.uniforms.tMixTexture.value = tex;
		
	}
	
	this.render = function ( delta ) {
	
		var transitionParams = renderer.transitionParams;
		
		// Transition animation
		this.time += delta;
		this.smoothTime = THREE.Math.smoothstep( this.time, 0, transitionParams.transitionDuration );
		this.quadmaterial.uniforms.mixRatio.value = this.smoothTime;

		if ( this.smoothTime == 0 ) {
		
			this.sceneA.render( delta, false );
			
		} else if ( this.smoothTime == 1 ) {
		
			this.sceneB.render( delta, false );
			
			// on complete
			if ( this.onTransitionComplete ) {
			
				this.onTransitionComplete( this.sceneB );
				
			}
			
		} else {
			
			// When 0<transition<1 render transition between two scenes
			this.quadmaterial.uniforms.tDiffuse1.value = this.sceneA.fbo;
			this.quadmaterial.uniforms.tDiffuse2.value = this.sceneB.fbo;

			this.sceneA.render( delta, true );
			this.sceneB.render( delta, true );
			
			THREE.PixelBoxUtil.updateViewPortUniform();

			renderer.webgl.render( this.scene, this.cameraOrtho, null, true );

		}

	}
	
	this.onResized = function () {
		
		var ww = renderer.webgl.domElement.width;
		var hh = renderer.webgl.domElement.height;
		
		this.quad.scale.set( ww, hh, 1.0 );
		
		this.quadmaterial.uniforms.tScale.value.set(
			Math.min( ww / hh, 1 ),
			Math.min( hh / ww, 1 )			
		);
		
		this.cameraOrtho.left = ww / -2;
		this.cameraOrtho.right = ww / 2;
		this.cameraOrtho.top = hh / 2;
		this.cameraOrtho.bottom = hh / -2;
		this.cameraOrtho.updateProjectionMatrix();			
		
		this.sceneA.onResized( true );
		this.sceneB.onResized( true );
		
	}
	
}

var renderer = new THREE.PixelBoxRenderer();
