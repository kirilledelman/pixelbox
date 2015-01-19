/*

	Screen shader to use with THREE.PixelBoxScene .screenPass == true
	
	Feel free to modify.
	
*/

THREE.PixelBoxScreenShader = {

	uniforms: {
		"tDiffuse":   { type: "t", value: null },
		"time":       { type: "f", value: 1.0 },
		"intensity": { type: "f", value: 0.1 }
	},

	vertexShader: [
		"varying vec2 vUv;",
		"void main() {",
			"vUv = uv;",
			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
		"}"

	].join( "\n" ),

	fragmentShader: [
		"uniform float time;",
		"uniform float intensity;",
		"uniform sampler2D tDiffuse;",

		"varying vec2 vUv;",
		
		//"varying out vec4 Color1;",

		"void main() {",
			// sample the source
			"vec4 cTextureScreen = texture2D( tDiffuse, vUv );",
			// make some noise
			"float x = vUv.x * vUv.y * time *  1000.0;",
			"x = mod( x, 13.0 ) * mod( x, 123.0 );",
			"float dx = mod( x, 0.01 );",
			// add noise
			"vec3 cResult = cTextureScreen.rgb + cTextureScreen.rgb * clamp( 0.1 + dx * 100.0, 0.0, 1.0 );",
			// interpolate between source and result by intensity
			"cResult = cTextureScreen.rgb + clamp( intensity, 0.0,1.0 ) * ( cResult - cTextureScreen.rgb );",
			"gl_FragColor =  vec4( cResult, cTextureScreen.a );",
		"}"

	].join( "\n" )

};

THREE.PixelBoxScreenPass = function ( sourceScene ) {

	var screenShader = THREE.PixelBoxScreenShader;

	this.screenUniforms = THREE.UniformsUtils.clone( screenShader.uniforms );

	this.screenMaterial = new THREE.ShaderMaterial( {
		uniforms: this.screenUniforms,
		vertexShader:  screenShader.vertexShader,
		fragmentShader: screenShader.fragmentShader
	} );

	this.enabled = true;
	this.needsSwap = false;
	this.clear = false;

	this.sourceScene = sourceScene;

	this.camera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0, 1 );
	this.scene  = new THREE.Scene();

	this.quad = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), this.screenMaterial );
	this.scene.add( this.quad );
	
};

THREE.PixelBoxScreenPass.prototype = {

	onResized: function() { },
	
	render: function ( webgl, writeBuffer, readBuffer, delta, maskActive ) {

		// render using shader
		
		this.screenUniforms.tDiffuse.value = readBuffer;		
		
		this.screenUniforms.time.value += delta;
		
		if ( this.renderToScreen ) {
		
			webgl.render( this.scene, this.camera );
			
		} else {
		
			webgl.render( this.scene, this.camera, writeBuffer, false );
			
		}
		
	}
	
};




