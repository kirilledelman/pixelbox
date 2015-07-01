/*
 * @author Kirill Edelman
 * @source https://github.com/kirilledelman/pixelbox
 * @documentation https://github.com/kirilledelman/pixelbox/wiki
 * @license MIT
*/

THREE.PixelBoxDepthShader = {
	uniforms: {
		tintAlpha: 	{ type: "f", value: 1.0 },
		pointSize: 	{ type: 'f', value: 1.0 }
	},
	
	vertexShader: [
		"attribute vec4 color;",
	
		"uniform float pointSize;",
		"uniform float tintAlpha;",
		
		"varying vec4 vColor;",
		
		"void main() {",
		"	vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
		
		"	vColor = vec4(color.rgb, color.a * tintAlpha);",
		"	gl_Position = projectionMatrix * mvPosition;",
		"	float pointScaleMult = max(length(vec3(modelMatrix[0][0],modelMatrix[1][0],modelMatrix[2][0] )),",
		"		max(length(vec3(modelMatrix[0][1],modelMatrix[1][1],modelMatrix[2][1] )),",
		"		length(vec3(modelMatrix[0][2],modelMatrix[1][2],modelMatrix[2][2] ))));",
		"	if (projectionMatrix[3][3] == 0.0) {",// perspective
		"		float fov = 2.0 * atan(1.0 / projectionMatrix[1][1]);",
		"		gl_PointSize = pointScaleMult * pointSize * 600.0 * fov / pow(gl_Position.w, 1.0 + fov * 0.25);",
		"	} else {", // ortho
		"		gl_PointSize = pointScaleMult * pointSize * 6.0;",
		"	} ",
		"}"	].join( "\n" ),

	fragmentShader: [
		"varying vec4 vColor;",
		"float rand(vec2 co) {",
		"	float a = 12.9898;",
		"	float b = 78.233;",
		"   float c = 43758.5453;",
		"   float dt= dot(co.xy ,vec2(a,b));",
		"   float sn= mod(dt,3.14);",
		"   return fract(sin(sn) * c);",
		"}",
		"vec4 pack_depth( const in float depth ) {",
		"	const vec4 bit_shift = vec4( 256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0 );",
		"	const vec4 bit_mask = vec4( 0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0 );",
		"	vec4 res = mod( depth * bit_shift * vec4( 255 ), vec4( 256 ) ) / vec4( 255 );",
		"	res -= res.xxyz * bit_mask;",
		"	return res;",
		"}",
		"void main() {",
		"	if (vColor.a < 1.0) {",
		"		float a = rand(gl_FragCoord.xy);",
		"		a = 1.0 - step(vColor.a, a);",
		"		if (a == 0.0) discard;",
		"	}",
		"	gl_FragData[ 0 ] = pack_depth(gl_FragCoord.z);",
		"}"
	].join( "\n" )

};

THREE.PixelBoxShader = {
	uniforms: {
		// tint color
		tintColor:	{ type: "c", value: new THREE.Color( 0xffffff ) }, // multiply tint 
		addColor:	{ type: "c", value: new THREE.Color( 0x0 ) }, // add tint
		tintAlpha: 	{ type: "f", value: 1.0 },
		
		// point scale
		pointSize: 	{ type: "f", value: 1.0 },
		
		// ambient occlusion effect
		occlusion: 	{ type: "f", value: 1.0 },
		
		// back facing cull mode
		cullBack: { type:"i", value: 1 },
		
		// fog color
		fogColor:    { type: "c", value: new THREE.Color( 0xFFFFFF ) },
	    fogNear:     { type: "f", value: 100 },
	    fogFar:      { type: "f", value: 1000 },
	    
	    // stipple
	    stipple: { type: "f", value: 0 },
	    
	    // shared uniforms
		viewPortScale: { type: "f", value: 0.0 },// viewport size
		actualHemiLights: { type: "i", value: 0 },	    
		actualPointLights: { type: "i", value: 0 },
		actualDirLights: { type: "i", value: 0 },
		directionalLightShadowMap: { type: "iv1", value: [] },
		actualSpotLights: { type: "i", value: 0 },
		spotLightShadowMap: { type: "iv1", value: [] }
		
	},

	attributes: {
		color:		{	type: "v4", value: null },
		normal: 	{	type: "v3", value: null },
		occlude:	{	type: "f", value: null },
		position:	{	type: "v3", value: null }
	},

	vertexShader: [
		"attribute vec4 color;",
		"attribute float occlude;",
		
		"uniform float pointSize;",
		"uniform float viewPortScale;",
		"uniform float tintAlpha;",
		"uniform vec3 tintColor;",
		"uniform vec3 addColor;",

		"uniform vec3 fogColor;",
		"uniform float fogNear;",
		"uniform float fogFar;",
		
		"uniform vec3 ambientLightColor;",
		"uniform float occlusion;",

		"uniform int actualHemiLights;",
		"uniform int actualDirLights;",
		"uniform int actualPointLights;",
		"uniform int actualSpotLights;",

		"uniform int cullBack;",

		"varying vec4 vColor;",
		
		"#ifdef USE_SHADOWMAP",
		"	uniform mat4 shadowMatrix[ MAX_SHADOWS ];",
		
		"	uniform sampler2D shadowMap[ MAX_SHADOWS ];",
		"	uniform vec2 shadowMapSize[ MAX_SHADOWS ];",
		"	uniform float shadowBias[ MAX_SHADOWS ];",
		
		"	float unpackDepth( const in vec4 rgba_depth ) {",		
		"		const vec4 bit_shift = vec4( 1.0 / ( 256.0 * 256.0 * 256.0 ), 1.0 / ( 256.0 * 256.0 ), 1.0 / 256.0, 1.0 );",
		"		float depth = dot( rgba_depth, bit_shift );",
		"		return depth;",
		"	}",
		
		"	vec3 getShadowColor(int shIndex, vec4 mPosition) {",
		"		float fDepth;",
		"		vec3 shadowColor = vec3( 1.0 );",
		
		"		vec4 shadowCoord4 = shadowMatrix[ shIndex ] * mPosition;",
		"		vec3 shadowCoord = shadowCoord4.xyz / shadowCoord4.w;",
		"		bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );",
		"		bool inFrustum = all( inFrustumVec );",
		"		bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );",
		"		bool frustumTest = all( frustumTestVec );",
		
		"		if ( frustumTest ) {",
		"			vec4 rgbaDepth;",
		"			if (shIndex == 0) {",
		"				rgbaDepth = texture2D( shadowMap[ 0 ], shadowCoord.xy );",
		"			}",
		"#if MAX_SHADOWS >= 2",
		"			else if (shIndex == 1) {",
		"				rgbaDepth = texture2D( shadowMap[ 1 ], shadowCoord.xy );",
		"			}",
		"#endif",
		"#if MAX_SHADOWS >= 3",
		"			else if (shIndex == 2) {",
		"				rgbaDepth = texture2D( shadowMap[ 2 ], shadowCoord.xy );",
		"			}",
		"#endif",
		"#if MAX_SHADOWS >= 4",
		"			else if (shIndex == 3) {",
		"				rgbaDepth = texture2D( shadowMap[ 3 ], shadowCoord.xy );",
		"			}",
		"#endif",
		"#if MAX_SHADOWS >= 5",
		"			else if (shIndex == 4) {",
		"				rgbaDepth = texture2D( shadowMap[ 4 ], shadowCoord.xy );",
		"			}",
		"#endif",
		"#if MAX_SHADOWS >= 6",
		"			else if (shIndex == 5) {",
		"				rgbaDepth = texture2D( shadowMap[ 5 ], shadowCoord.xy );",
		"			}",
		"#endif",
		"#if MAX_SHADOWS >= 7",
		"			else if (shIndex == 6) {",
		"				rgbaDepth = texture2D( shadowMap[ 6 ], shadowCoord.xy );",
		"			}",
		"#endif",
		"#if MAX_SHADOWS >= 8",
		"			else if (shIndex == 7) {",
		"				rgbaDepth = texture2D( shadowMap[ 7 ], shadowCoord.xy );",
		"			}",
		"#endif",
		"			float fDepth = unpackDepth( rgbaDepth );",
		"			shadowCoord.z += shadowBias[ shIndex ];",
		"			if ( fDepth < shadowCoord.z ) {",
		"				shadowColor = vec3(0.0);",
		"			}",
		
		"		}",
		
		"		return shadowColor;",		
		"	}",
		
		
		"#endif",
		
		"#if MAX_DIR_LIGHTS > 0",
		"uniform vec3 directionalLightColor[ MAX_DIR_LIGHTS ];",
		"uniform vec3 directionalLightDirection[ MAX_DIR_LIGHTS ];",
		"uniform int directionalLightShadowMap[ MAX_DIR_LIGHTS ];",
		"#endif",
		
		"#if MAX_SPOT_LIGHTS > 0",
		"uniform vec3 spotLightColor[ MAX_SPOT_LIGHTS ];",
		"uniform vec3 spotLightPosition[ MAX_SPOT_LIGHTS ];",
		"uniform vec3 spotLightDirection[ MAX_SPOT_LIGHTS ];",
		"uniform float spotLightAngleCos[ MAX_SPOT_LIGHTS ];",
		"uniform float spotLightExponent[ MAX_SPOT_LIGHTS ];",
		"uniform float spotLightDistance[ MAX_SPOT_LIGHTS ];",
		"uniform int spotLightShadowMap[ MAX_SPOT_LIGHTS ];",
		"#endif",
		
		"#if MAX_HEMI_LIGHTS > 0",
		"uniform vec3 hemisphereLightSkyColor[ MAX_HEMI_LIGHTS ];",
		"uniform vec3 hemisphereLightGroundColor[ MAX_HEMI_LIGHTS ];",
		"uniform vec3 hemisphereLightDirection[ MAX_HEMI_LIGHTS ];",
		"#endif",
		
		"#if MAX_POINT_LIGHTS > 0",
		"uniform vec3 pointLightColor[ MAX_POINT_LIGHTS ];",
		"uniform vec3 pointLightPosition[ MAX_POINT_LIGHTS ];",
		"uniform float pointLightDistance[ MAX_POINT_LIGHTS ];",
		"#endif",
		
		"void main() {",
		"	vec3 diffuse = color.xyz;",
		"	diffuse *= tintColor;",
		
		"	vec3 totalAmbient = diffuse * ambientLightColor;",
		"	vec3 totalDirect = vec3(0.0);",
		"	vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
		"	vec4 mPosition = modelMatrix * vec4( position, 1.0 );",
		"	float normalLength = length(normal);",
		"	float brightness = normalLength - 1.0;",
		"	vec3 vertexNormal = normalize(normalMatrix * normal);",		
		
		"	if (cullBack != 0 && vertexNormal.z <= -0.5) { ",
		"		vColor = vec4(0.0);",
		"	} else { ",
		
		// point
		"#if MAX_POINT_LIGHTS > 0",
		"vec3 pointDiffuse = vec3( 0.0 );",
		"for ( int i = 0; i < MAX_POINT_LIGHTS; i ++ ) {",	//
		"	if (i < actualPointLights) {",
		"	vec4 lPosition = viewMatrix * vec4( pointLightPosition[ i ], 1.0 );",
		"	vec3 lVector = lPosition.xyz - mvPosition.xyz;",
		"	float lDistance = 1.0;",
		"	if ( pointLightDistance[ i ] > 0.0 )",
		"		lDistance = 1.0 - min( ( length( lVector ) / pointLightDistance[ i ] ), 1.0 );",
		"	lVector = normalize( lVector );",
		"	float dotProduct = dot( vertexNormal, lVector );",
		"	if (occlude < 0.0) dotProduct = (1.0 + max(dotProduct, 0.0) + occlude) * 0.5;",
		"	#ifdef WRAP_AROUND",
		"		float pointDiffuseWeightFull = max( dotProduct, 0.0 );",
		"		float pointDiffuseWeightHalf = max( 0.5 * dotProduct + 0.5, 0.0 );",
		"		vec3 pointDiffuseWeight = mix( vec3( pointDiffuseWeightFull ), vec3( pointDiffuseWeightHalf ), wrapRGB );",
		"	#else",
		"		float pointDiffuseWeight = max( dotProduct, 0.0 );",
		"	#endif",
		"	pointDiffuse += diffuse * pointLightColor[ i ] * pointDiffuseWeight * lDistance;",
		"	}",
		"}",
		"totalDirect += pointDiffuse;",
		"#endif",
	
		// temp vars used in shadows
		"	vec3 thisLight;",
		"	int shadowMapIndex;",
	
		// directional
		"#if MAX_DIR_LIGHTS > 0",
		"vec3 dirDiffuse = vec3( 0.0 );",
	
		"for ( int i = 0; i < MAX_DIR_LIGHTS; i ++ ) {", //
		"	if (i < actualDirLights) {",		
		"	vec4 lDirection = viewMatrix * vec4( directionalLightDirection[ i ], 0.0 );",
		"	vec3 dirVector = normalize( lDirection.xyz);",
		"	float dotProduct = dot(vertexNormal, dirVector);",
		"	if (occlude < 0.0) dotProduct = (1.0 + max(dotProduct, 0.0) + occlude) * 0.5;",
		"	#ifdef WRAP_AROUND",
		"		float dirDiffuseWeightFull = max( dotProduct, 0.0 );",
		"		float dirDiffuseWeightHalf = max( 0.5 * dotProduct + 0.5, 0.0 );",
		"		vec3 dirDiffuseWeight = mix( vec3( dirDiffuseWeightFull ), vec3( dirDiffuseWeightHalf ), wrapRGB );",
		"	#else",
		"		float dirDiffuseWeight = max( dotProduct, 0.0 );",
		"	#endif",
		"	thisLight = diffuse * directionalLightColor[ i ] * dirDiffuseWeight;",
		"#ifdef USE_SHADOWMAP",
		"	shadowMapIndex = directionalLightShadowMap[ i ];",
		"	if (shadowMapIndex != 0) {",
		"		thisLight = thisLight * getShadowColor(shadowMapIndex - 1, mPosition);",
		"	}",
		"#endif",
		"	dirDiffuse += thisLight;",
		"	}",
		"}",
		"totalDirect += dirDiffuse;",
		"#endif",
	
		"#if MAX_SPOT_LIGHTS > 0",
		"vec3 spotDiffuse = vec3( 0.0 );",
		"for ( int i = 0; i < MAX_SPOT_LIGHTS; i ++ ) {", //
		"	if (i < actualSpotLights) {",		
		"	vec4 lPosition = viewMatrix * vec4( spotLightPosition[ i ], 1.0 );",
		"	vec3 lVector = lPosition.xyz - mvPosition.xyz;//lPosition.xyz + vViewPosition.xyz;",
		"	float lDistance = 1.0;",
		"	if ( spotLightDistance[ i ] > 0.0 )",
		"		lDistance = 1.0 - min( ( length( lVector ) / spotLightDistance[ i ] ), 1.0 );",
		"	lVector = normalize( lVector );",
		"	float spotEffect = dot( spotLightDirection[ i ], normalize( spotLightPosition[ i ] - mPosition.xyz ) );",
		"	if ( spotEffect > spotLightAngleCos[ i ] ) {",
		"		spotEffect = max( pow( max( spotEffect, 0.0 ), spotLightExponent[ i ] * 0.25 ), 0.0 );",
				// diffuse
		"		float dotProduct = dot( vertexNormal, lVector );",
		"		if (occlude < 0.0) dotProduct = (1.0 + max(dotProduct, 0.0) + occlude) * 0.5;",
		"		#ifdef WRAP_AROUND",
		"			float spotDiffuseWeightFull = max( dotProduct, 0.0 );",
		"			float spotDiffuseWeightHalf = max( 0.5 * dotProduct + 0.5, 0.0 );",
		"			vec3 spotDiffuseWeight = mix( vec3( spotDiffuseWeightFull ), vec3( spotDiffuseWeightHalf ), wrapRGB );",
		"		#else",
		"			float spotDiffuseWeight = max( dotProduct, 0.0 );",
		"		#endif",
		"		thisLight = diffuse * spotLightColor[ i ] * spotDiffuseWeight * lDistance * spotEffect;",
		"#ifdef USE_SHADOWMAP",
		"		shadowMapIndex = spotLightShadowMap[ i ];",
		"		if (shadowMapIndex != 0) {",
		"			thisLight = thisLight * getShadowColor(shadowMapIndex - 1, mPosition);",
		"		}",			
		"#endif",
		"		spotDiffuse += thisLight;",
		"	}",
		"	}",
		"}",
		"totalDirect += spotDiffuse;",
		"#endif",
	
		// hemi
		"#if MAX_HEMI_LIGHTS > 0",
		"vec3 hemiDiffuse = vec3( 0.0 );",
		"for ( int i = 0; i < MAX_HEMI_LIGHTS; i ++ ) {", //
		"	if (i < actualHemiLights) {",		
		"	vec4 lDirection = viewMatrix * vec4( hemisphereLightDirection[ i ], 0.0 );",
		"	vec3 lVector = normalize( lDirection.xyz );",
		"	float dotProduct = dot( vertexNormal, lVector );",
		"	if (occlude < 0.0) dotProduct = (1.0 + max(dotProduct, 0.0) + occlude) * 0.5;",
		"	float hemiDiffuseWeight = 0.5 * dotProduct + 0.5;",
		"	vec3 hemiColor = mix( hemisphereLightGroundColor[ i ], hemisphereLightSkyColor[ i ], hemiDiffuseWeight );",
		"	hemiDiffuse += diffuse * hemiColor;",
		"	}",
		"}",
		"totalAmbient += hemiDiffuse;",
		"#endif",
		
		"totalAmbient = totalAmbient * clamp(1.0 - occlusion * abs(occlude), 0.0, 1.0);",
		"vec3 totalDiffuse = mix(totalAmbient + totalDirect, diffuse, brightness);",
	
		// fog
		"	float depth = distance(mvPosition.xyz, cameraPosition);",
		"	vColor = vec4(addColor + mix(totalDiffuse, fogColor, smoothstep( fogNear, fogFar, depth )), color.a * tintAlpha);",
		
		"	} // end if cullBack ",
		
		"	gl_Position = projectionMatrix * mvPosition;",
		"	float pointScaleMult = max(length(vec3(modelMatrix[0][0],modelMatrix[1][0],modelMatrix[2][0] )),",
		"		max(length(vec3(modelMatrix[0][1],modelMatrix[1][1],modelMatrix[2][1] )),",
		"		length(vec3(modelMatrix[0][2],modelMatrix[1][2],modelMatrix[2][2] ))));",
		"	gl_PointSize = pointScaleMult * viewPortScale * pointSize / gl_Position.w;",
		"}"	].join( "\n" ),
		
	fragmentShader: [
		"varying vec4 vColor;",
		"uniform float stipple;",
		
		"float rand(vec2 co) {",
		"	float a = 12.9898;",
		"	float b = 78.233;",
		"   float c = 43758.5453;",
		"   float dt= dot(co.xy ,vec2(a,b));",
		"   float sn= mod(dt,3.14);",
		"   return fract(sin(sn) * c);",
		"}",
		"void main() {",
		"	float s = 1.0; ",
		"	if (stipple != 0.0) { ",
		"		vec2 stip = fract( vec2(gl_FragCoord.x + stipple, gl_FragCoord.y) * 0.5);",
		"		s = step(0.25,abs(stip.x-stip.y));",
		"	}",
		"	if (vColor.a == 0.0 || s == 0.0) discard;",
		"	else if (vColor.a < 1.0) {",
		"		float a = rand(gl_FragCoord.xy);",
		"		a = s * (1.0 - step(vColor.a, a));",
		"		if (a == 0.0) discard;",
		"	}",		
		"	gl_FragColor = vec4(vColor.rgb, 1.0);",
		"}"
	].join( "\n" )

};

THREE.PixelBoxMeshDepthShader = {
	uniforms: {
		map: { type: "t", value: null },
		tintAlpha: 	{ type: "f", value: 1.0 },
		alphaThresh: 	{ type: "f", value: 0 },

		// slice texture params
		uvSliceRect: { type: "v4", value: { x: 0, y: 1, z: 1, w: 0 } },
		uvSliceOffset: { type: "v4", value: { x: 0, y: 1, z: 1, w: 1 } },
		uvSliceSizeIsRotated: { type: "v3", value: { x: 1, y: 1, z: 0 } },

		// fxSprite billboarding
		parentWorldMatrix: { type: "m4", value: new THREE.Matrix4() },
		localMatrix: { type: "m4", value: new THREE.Matrix4() },
		spriteTransform: { type: "m4", value: new THREE.Matrix4() }

	},

	vertexShader: [
		"varying vec2 vUv;",

		"uniform mat4 parentWorldMatrix;",
		"uniform mat4 localMatrix;",
		"uniform mat4 spriteTransform;",

		"void main() {",
		"   vec4 mvPosition;",

		"   #ifdef BILLBOARD",
		"       mat4 modelView = viewMatrix * parentWorldMatrix;",
		"	    modelView[0][0] = 1.0;",
		"	    modelView[0][1] = 0.0;",
		"       modelView[0][2] = 0.0;",
		"	    modelView[1][0] = 0.0;",
		"	    modelView[1][1] = 1.0;",
		"   	modelView[1][2] = 0.0;",
		"       modelView[2][0] = 0.0;",
		"       modelView[2][1] = 0.0;",
		"       modelView[2][2] = 1.0;",
		"       modelView = modelView * spriteTransform * localMatrix;",

		"	    mvPosition = modelView * vec4( position, 1.0 );",
		"   #else",
		"	    mvPosition = modelViewMatrix * vec4( position, 1.0 );",
		"   #endif",

		"	vUv = uv;",
		"	gl_Position = projectionMatrix * mvPosition;",

		"}"	].join( "\n" ),

	fragmentShader: [
		"varying vec2 vUv;",
		"#ifdef USE_MAP",
		"uniform sampler2D map;",
		"uniform vec4 uvSliceRect;",
		"uniform vec4 uvSliceOffset;",
		"uniform vec3 uvSliceSizeIsRotated;",
		"#endif",
		"uniform float tintAlpha;",
		"uniform float alphaThresh;",

		"#ifdef USE_MAP",
		"vec4 sampleSlice(){",
		"   vec2 _uv;",
		"   #ifdef BILLBOARD",
		"   if (uvSliceSizeIsRotated.z < 1.0) { ",
		"       _uv =  vUv;",
		"       _uv.x = uvSliceOffset.x + ( _uv.x ) * uvSliceOffset.z;",
		"       _uv.y = uvSliceOffset.y - ( 1.0 - _uv.y ) * uvSliceOffset.w;",
		"   } else { ",
		"       _uv = vec2(vUv.y, vUv.x);",
		"       _uv.x = uvSliceOffset.x + ( _uv.x ) * uvSliceOffset.z;",
		"       _uv.y = uvSliceOffset.y - ( _uv.y ) * uvSliceOffset.w;",
		"   }",
		"   #else",
		"   if (uvSliceSizeIsRotated.z < 1.0) { ",
		"       _uv =  vUv;",
		"       if(_uv.x <= uvSliceRect.x || _uv.y <= uvSliceRect.w || _uv.x >= uvSliceRect.z || _uv.y >= uvSliceRect.y) {",
		"           discard;",
		"       }",
		"       _uv.x = uvSliceOffset.x + (_uv.x - uvSliceRect.x) * uvSliceSizeIsRotated.x;",
		"       _uv.y = uvSliceOffset.y + (_uv.y - uvSliceRect.y) * uvSliceSizeIsRotated.y;",

		"   } else { ",
		"       _uv = vec2(vUv.y, 1.0 - vUv.x);",
		"       if(vUv.x <= uvSliceRect.x || vUv.y <= uvSliceRect.w || vUv.x >= uvSliceRect.z || vUv.y >= uvSliceRect.y) {",
		"           discard;",
		"       }",
		"       _uv.x = uvSliceOffset.x + (_uv.x - uvSliceRect.w) * uvSliceSizeIsRotated.y;",
		"       _uv.y = uvSliceOffset.y + (_uv.y - (1.0 - uvSliceRect.x)) * uvSliceSizeIsRotated.x;",
		"   }",
		"   #endif",
		"   return texture2D( map, _uv );",
		"}",
		"#endif",

		"float rand(vec2 co) {",
		"	float a = 12.9898;",
		"	float b = 78.233;",
		"   float c = 43758.5453;",
		"   float dt= dot(co.xy ,vec2(a,b));",
		"   float sn= mod(dt,3.14);",
		"   return fract(sin(sn) * c);",
		"}",
		"vec4 pack_depth( const in float depth ) {",
		"	const vec4 bit_shift = vec4( 256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0 );",
		"	const vec4 bit_mask = vec4( 0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0 );",
		"	vec4 res = mod( depth * bit_shift * vec4( 255 ), vec4( 256 ) ) / vec4( 255 );",
		"	res -= res.xxyz * bit_mask;",
		"	return res;",
		"}",
		"void main() {",
		"   vec4 texColor = vec4(0.0, 0.0, 0.0, 1.0);",
		"#ifdef USE_MAP",
		"   texColor = sampleSlice();",
		"#endif",
		"   texColor.a = texColor.a <= alphaThresh ? 0.0 : (texColor.a * tintAlpha);",
		"	if (texColor.a < 1.0) {",
		"		float a = rand(gl_FragCoord.xy);",
		"		a = 1.0 - step(texColor.a, a);",
		"		if (a == 0.0) discard;",
		"	}",
		"	gl_FragData[ 0 ] = pack_depth(gl_FragCoord.z);",
		"}"
	].join( "\n" )

};

THREE.PixelBoxMeshShader = {
	uniforms: {
		// texture
		map: { type: "t", value: null },

		// tint color
		tintColor:	{ type: "c", value: new THREE.Color( 0xffffff ) },
		addColor:	{ type: "c", value: new THREE.Color( 0x0 ) },
		tintAlpha: 	{ type: "f", value: 1.0 },
		brightness: { type: "f", value: 0.0 },

		// alpha values below this one are cut off
		alphaThresh: { type: "f", value: 0.0 },
		
		// fog color
		fogColor:    { type: "c", value: new THREE.Color( 0xFFFFFF ) },
	    fogNear:     { type: "f", value: 100 },
	    fogFar:      { type: "f", value: 1000 },
	    
	    // stipple
	    stipple: { type: "f", value: 0 },
	    
	    // shared uniforms
		actualHemiLights: { type: "i", value: 0 },	    
		actualPointLights: { type: "i", value: 0 },
		actualDirLights: { type: "i", value: 0 },
		directionalLightShadowMap: { type: "iv1", value: [] },
		actualSpotLights: { type: "i", value: 0 },
		spotLightShadowMap: { type: "iv1", value: [] },

		// texture params
		uvSliceRect: { type: "v4", value: { x: 0, y: 1, z: 1, w: 0 } },
		uvSliceOffset: { type: "v4", value: { x: 0, y: 1, z: 1, w: 1 } },
		uvSliceSizeIsRotated: { type: "v3", value: { x: 1, y: 1, z: 0 } },

		// fxSprite billboarding
		billboard: { type: "i", value: 0 },
		parentWorldMatrix: { type: "m4", value: new THREE.Matrix4() },
		localMatrix: { type: "m4", value: new THREE.Matrix4() },
		spriteTransform: { type: "m4", value: new THREE.Matrix4() }

	},

	attributes: {},

	vertexShader: [
	"varying vec3 vViewPosition;",
	"varying vec3 vNormal;",
	"varying vec4 vWorldPosition;",
	"varying vec2 vUv;",

	"uniform mat4 parentWorldMatrix;",
	"uniform mat4 localMatrix;",
	"uniform mat4 spriteTransform;",

	"void main() {",
	"#ifdef FLIP_SIDED",
	"	vNormal = normalize( normalMatrix * (-normal) );",
	"#else",
	"	vNormal = normalize( normalMatrix * normal );",
	"#endif",

	"   vec4 mvPosition;",

	"   #ifdef BILLBOARD",
	"       mat4 modelView = viewMatrix * parentWorldMatrix;",
	"	    modelView[0][0] = 1.0;",
	"	    modelView[0][1] = 0.0;",
	"       modelView[0][2] = 0.0;",
	"	    modelView[1][0] = 0.0;",
	"	    modelView[1][1] = 1.0;",
	"   	modelView[1][2] = 0.0;",
	"       modelView[2][0] = 0.0;",
	"       modelView[2][1] = 0.0;",
	"       modelView[2][2] = 1.0;",
	"       modelView = modelView * spriteTransform * localMatrix;",

	"	    mvPosition = modelView * vec4( position, 1.0 );",
	"   #else",
	"	    mvPosition = modelViewMatrix * vec4( position, 1.0 );",
	"   #endif",

	"	vViewPosition = -mvPosition.xyz;",
	"	vWorldPosition = modelMatrix * vec4( position, 1.0 );",
	"   vUv = uv; ",
	"	gl_Position = projectionMatrix * mvPosition;",
	"}"
	].join( "\n" ),
	
	fragmentShader: [
	"varying vec2 vUv;",
	"#ifdef USE_MAP",
	"uniform sampler2D map;",
	"uniform vec4 uvSliceRect;",
	"uniform vec4 uvSliceOffset;",
	"uniform vec3 uvSliceSizeIsRotated;",
	"#endif",
	"uniform vec3 tintColor;",
	"uniform vec3 addColor;",
	"uniform float tintAlpha;",
	"uniform float alphaThresh;",
	"uniform float stipple;",
	"uniform float brightness;",

	"uniform vec3 ambientLightColor;",

	"uniform int actualHemiLights;",
	"uniform int actualDirLights;",
	"uniform int actualPointLights;",
	"uniform int actualSpotLights;",

	"varying vec3 vViewPosition;",
	"varying vec3 vNormal;",
	"varying vec4 vWorldPosition;",
	
	"uniform vec3 fogColor;",
	"uniform float fogNear;",
	"uniform float fogFar;",

	"#ifdef USE_SHADOWMAP",
	"	uniform mat4 shadowMatrix[ MAX_SHADOWS ];",	
	"	uniform sampler2D shadowMap[ MAX_SHADOWS ];",
	"	uniform vec2 shadowMapSize[ MAX_SHADOWS ];",
	"	uniform float shadowBias[ MAX_SHADOWS ];",
	
	"	float unpackDepth( const in vec4 rgba_depth ) {",		
	"		const vec4 bit_shift = vec4( 1.0 / ( 256.0 * 256.0 * 256.0 ), 1.0 / ( 256.0 * 256.0 ), 1.0 / 256.0, 1.0 );",
	"		float depth = dot( rgba_depth, bit_shift );",
	"		return depth;",
	"	}",
	
	"	vec3 getShadowColor(int shadowIndex, vec4 mPosition) {",
	"		vec3 shadowColor = vec3(1.0);",
	"		float fDepth;",

	"#ifdef BILLBOARD",
	"   #define SHADOW_THRESH 0.005",
	"#else",
	"   #define SHADOW_THRESH 0.0",
	"#endif",

	"		if (shadowIndex == 0) {",
	"			vec4 sm = shadowMatrix[ 0 ] * mPosition;",
	"			vec3 shadowCoord = sm.xyz / sm.w;",
	"			bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );",
	"			bool inFrustum = all( inFrustumVec );",
	"			bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );",
	"			bool frustumTest = all( frustumTestVec );",
	"			if ( frustumTest ) {",
	"				shadowCoord.z += shadowBias[ 0 ];",
	"				float fDepth = unpackDepth( texture2D( shadowMap[ 0 ], shadowCoord.xy ) );",
	"				if ( shadowCoord.z - fDepth > SHADOW_THRESH ) {",
	"					shadowColor = vec3(0.0);",
	"				}",
	"			}",
	"		} ",
	"#if MAX_SHADOWS >= 2",
	"		else ",
	"		if (shadowIndex == 1) {",
	"			vec4 sm = shadowMatrix[ 1 ] * mPosition;",
	"			vec3 shadowCoord = sm.xyz / sm.w;",
	"			bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );",
	"			bool inFrustum = all( inFrustumVec );",
	"			bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );",
	"			bool frustumTest = all( frustumTestVec );",
	"			if ( frustumTest ) {",
	"				shadowCoord.z += shadowBias[ 1 ];",
	"				float fDepth = unpackDepth( texture2D( shadowMap[ 1 ], shadowCoord.xy ) );",
	"				if ( shadowCoord.z - fDepth > SHADOW_THRESH ) {",
	"					shadowColor = vec3(0.0);",
	"				}",
	"			}",
	"		} ",
	"#endif",
	"#if MAX_SHADOWS >= 3",
	"		else ",
	"		if (shadowIndex == 2) {",
	"			vec4 sm = shadowMatrix[ 2 ] * mPosition;",
	"			vec3 shadowCoord = sm.xyz / sm.w;",
	"			bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );",
	"			bool inFrustum = all( inFrustumVec );",
	"			bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );",
	"			bool frustumTest = all( frustumTestVec );",
	"			if ( frustumTest ) {",
	"				shadowCoord.z += shadowBias[ 2 ];",
	"				float fDepth = unpackDepth( texture2D( shadowMap[ 2 ], shadowCoord.xy ) );",
	"				if ( shadowCoord.z - fDepth > SHADOW_THRESH ) {",
	"					shadowColor = vec3(0.0);",
	"				}",
	"			}",
	"		} ",
	"#endif",
	"#if MAX_SHADOWS >= 4",
	"		else ",
	"		if (shadowIndex == 3) {",
	"			vec4 sm = shadowMatrix[ 3 ] * mPosition;",
	"			vec3 shadowCoord = sm.xyz / sm.w;",
	"			bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );",
	"			bool inFrustum = all( inFrustumVec );",
	"			bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );",
	"			bool frustumTest = all( frustumTestVec );",
	"			if ( frustumTest ) {",
	"				shadowCoord.z += shadowBias[ 3 ];",
	"				float fDepth = unpackDepth( texture2D( shadowMap[ 3 ], shadowCoord.xy ) );",
	"				if ( shadowCoord.z - fDepth > SHADOW_THRESH ) {",
	"					shadowColor = vec3(0.0);",
	"				}",
	"			}",
	"		}",
	"#endif",
	"#if MAX_SHADOWS >= 5",
	"		else ",
	"		if (shadowIndex == 4) {",
	"			vec4 sm = shadowMatrix[ 4 ] * mPosition;",
	"			vec3 shadowCoord = sm.xyz / sm.w;",
	"			bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );",
	"			bool inFrustum = all( inFrustumVec );",
	"			bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );",
	"			bool frustumTest = all( frustumTestVec );",
	"			if ( frustumTest ) {",
	"				shadowCoord.z += shadowBias[ 4 ];",
	"				float fDepth = unpackDepth( texture2D( shadowMap[ 4 ], shadowCoord.xy ) );",
	"				if ( shadowCoord.z - fDepth > SHADOW_THRESH ) {",
	"					shadowColor = vec3(0.0);",
	"				}",
	"			}",
	"		}",
	"#endif",
	"#if MAX_SHADOWS >= 6",
	"		else ",
	"		if (shadowIndex == 5) {",
	"			vec4 sm = shadowMatrix[ 5 ] * mPosition;",
	"			vec3 shadowCoord = sm.xyz / sm.w;",
	"			bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );",
	"			bool inFrustum = all( inFrustumVec );",
	"			bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );",
	"			bool frustumTest = all( frustumTestVec );",
	"			if ( frustumTest ) {",
	"				shadowCoord.z += shadowBias[ 5 ];",
	"				float fDepth = unpackDepth( texture2D( shadowMap[ 5 ], shadowCoord.xy ) );",
	"				if ( shadowCoord.z - fDepth > SHADOW_THRESH ) {",
	"					shadowColor = vec3(0.0);",
	"				}",
	"			}",
	"		}",
	"#endif",
	"#if MAX_SHADOWS >= 7",
	"		else ",
	"		if (shadowIndex == 6) {",
	"			vec4 sm = shadowMatrix[ 6 ] * mPosition;",
	"			vec3 shadowCoord = sm.xyz / sm.w;",
	"			bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );",
	"			bool inFrustum = all( inFrustumVec );",
	"			bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );",
	"			bool frustumTest = all( frustumTestVec );",
	"			if ( frustumTest ) {",
	"				shadowCoord.z += shadowBias[ 6 ];",
	"				float fDepth = unpackDepth( texture2D( shadowMap[ 6 ], shadowCoord.xy ) );",
	"				if ( shadowCoord.z - fDepth > SHADOW_THRESH ) {",
	"					shadowColor = vec3(0.0);",
	"				}",
	"			}",
	"		}",
	"#endif",
	"#if MAX_SHADOWS >= 8",
	"		else ",
	"		if (shadowIndex == 7) {",
	"			vec4 sm = shadowMatrix[ 7 ] * mPosition;",
	"			vec3 shadowCoord = sm.xyz / sm.w;",
	"			bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );",
	"			bool inFrustum = all( inFrustumVec );",
	"			bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );",
	"			bool frustumTest = all( frustumTestVec );",
	"			if ( frustumTest ) {",
	"				shadowCoord.z += shadowBias[ 7 ];",
	"				float fDepth = unpackDepth( texture2D( shadowMap[ 7 ], shadowCoord.xy ) );",
	"				if ( shadowCoord.z - fDepth > SHADOW_THRESH ) {",
	"					shadowColor = vec3(0.0);",
	"				}",
	"			}",
	"		}",
	"#endif",
	"		return shadowColor;",
	"	}",
	
	
	"#endif",
	
	"#if MAX_DIR_LIGHTS > 0",
	"uniform vec3 directionalLightColor[ MAX_DIR_LIGHTS ];",
	"uniform vec3 directionalLightDirection[ MAX_DIR_LIGHTS ];",
	"uniform int directionalLightShadowMap[ MAX_DIR_LIGHTS ];",
	"#endif",
	
	"#if MAX_SPOT_LIGHTS > 0",
	"uniform vec3 spotLightColor[ MAX_SPOT_LIGHTS ];",
	"uniform vec3 spotLightPosition[ MAX_SPOT_LIGHTS ];",
	"uniform vec3 spotLightDirection[ MAX_SPOT_LIGHTS ];",
	"uniform float spotLightAngleCos[ MAX_SPOT_LIGHTS ];",
	"uniform float spotLightExponent[ MAX_SPOT_LIGHTS ];",
	"uniform float spotLightDistance[ MAX_SPOT_LIGHTS ];",
	"uniform int spotLightShadowMap[ MAX_SPOT_LIGHTS ];",
	"#endif",
	
	"#if MAX_HEMI_LIGHTS > 0",
	"uniform vec3 hemisphereLightSkyColor[ MAX_HEMI_LIGHTS ];",
	"uniform vec3 hemisphereLightGroundColor[ MAX_HEMI_LIGHTS ];",
	"uniform vec3 hemisphereLightDirection[ MAX_HEMI_LIGHTS ];",
	"#endif",
	
	"#if MAX_POINT_LIGHTS > 0",
	"uniform vec3 pointLightColor[ MAX_POINT_LIGHTS ];",
	"uniform vec3 pointLightPosition[ MAX_POINT_LIGHTS ];",
	"uniform float pointLightDistance[ MAX_POINT_LIGHTS ];",
	"#endif",

	"float rand(vec2 co) {",
	"	float a = 12.9898;",
	"	float b = 78.233;",
	"   float c = 43758.5453;",
	"   float dt = dot(co.xy ,vec2(a,b));",
	"   float sn = mod(dt,3.14);",
	"   return fract(sin(sn) * c);",
	"}",

	"#ifdef USE_MAP",
	"vec4 sampleSlice(){",
	"   vec2 _uv;",
	"   #ifdef BILLBOARD",
	"   if (uvSliceSizeIsRotated.z < 1.0) { ",
	"       _uv =  vUv;",
	"       _uv.x = uvSliceOffset.x + ( _uv.x ) * uvSliceOffset.z;",
	"       _uv.y = uvSliceOffset.y - ( 1.0 - _uv.y ) * uvSliceOffset.w;",
	"   } else { ",
	"       _uv = vec2(vUv.y, vUv.x);",
	"       _uv.x = uvSliceOffset.x + ( _uv.x ) * uvSliceOffset.z;",
	"       _uv.y = uvSliceOffset.y - ( _uv.y ) * uvSliceOffset.w;",
	"   }",
	"   #else",
	"   if (uvSliceSizeIsRotated.z < 1.0) { ",
	"       _uv =  vUv;",
	"       if(_uv.x <= uvSliceRect.x || _uv.y <= uvSliceRect.w || _uv.x >= uvSliceRect.z || _uv.y >= uvSliceRect.y) {",
	"           discard;",
	"       }",
	"       _uv.x = uvSliceOffset.x + (_uv.x - uvSliceRect.x) * uvSliceSizeIsRotated.x;",
	"       _uv.y = uvSliceOffset.y + (_uv.y - uvSliceRect.y) * uvSliceSizeIsRotated.y;",

	"   } else { ",
	"       _uv = vec2(vUv.y, 1.0 - vUv.x);",
	"       if(vUv.x <= uvSliceRect.x || vUv.y <= uvSliceRect.w || vUv.x >= uvSliceRect.z || vUv.y >= uvSliceRect.y) {",
	"           discard;",
	"       }",
	"       _uv.x = uvSliceOffset.x + (_uv.x - uvSliceRect.w) * uvSliceSizeIsRotated.y;",
	"       _uv.y = uvSliceOffset.y + (_uv.y - (1.0 - uvSliceRect.x)) * uvSliceSizeIsRotated.x;",
	"   }",
	"   #endif",
	"   return texture2D( map, _uv );",
	"}",
	"#endif",

	"void main() {",
	//	stipple and alpha
	"	float s = 1.0; ",
	"   float texAlpha = 1.0;",
	"   vec3 texColor = vec3( 1.0, 1.0, 1.0 );",
	"	if (stipple != 0.0) { ",
	"		vec2 stip = fract( vec2(gl_FragCoord.x + stipple, gl_FragCoord.y) * 0.5);",
	"		s = step(0.25,abs(stip.x-stip.y));",
	"	}",
	"#ifdef USE_MAP",
	"   vec4 tex = sampleSlice();",
	"   texAlpha = tex.a <= alphaThresh ? 0.0 : tex.a;",
	"   texColor = tex.xyz;",
	"#endif",
	"   texAlpha *= tintAlpha;",
	"	if (texAlpha == 0.0 || s == 0.0) discard;",
	"	else if (texAlpha < 1.0) {",
	"		float a = rand(gl_FragCoord.xy);",
	"		a = s * (1.0 - step(texAlpha, a));",
	"		if (a == 0.0) discard;",
	"	}",
	
	"	vec3 diffuse = tintColor * texColor;",
	
	"	vec3 totalAmbient = diffuse * ambientLightColor;",
	"	vec3 totalDirect = vec3(0.0);",
	"	vec4 mvPosition = vec4(-vViewPosition.xyz, 1.0 );",
	"	vec4 mPosition = vWorldPosition;",
	"	vec3 vertexNormal = normalize(vNormal);",
	
	// point
	"#if MAX_POINT_LIGHTS > 0",
	"vec3 pointDiffuse = vec3( 0.0 );",
	"for ( int i = 0; i < MAX_POINT_LIGHTS; i ++ ) {",	//
	"	if (i < actualPointLights) {",
	"	vec4 lPosition = viewMatrix * vec4( pointLightPosition[ i ], 1.0 );",
	"	vec3 lVector = lPosition.xyz - mvPosition.xyz;",
	"	float lDistance = 1.0;",
	"	if ( pointLightDistance[ i ] > 0.0 )",
	"		lDistance = 1.0 - min( ( length( lVector ) / pointLightDistance[ i ] ), 1.0 );",
	"	lVector = normalize( lVector );",
	"   #ifdef BILLBOARD",
	"   float dotProduct = 1.0;",
	"   #else",
	"	float dotProduct = dot( vertexNormal, lVector );",
	"   #endif",
	"	#ifdef WRAP_AROUND",
	"		float pointDiffuseWeightFull = max( dotProduct, 0.0 );",
	"		float pointDiffuseWeightHalf = max( 0.5 * dotProduct + 0.5, 0.0 );",
	"		vec3 pointDiffuseWeight = mix( vec3( pointDiffuseWeightFull ), vec3( pointDiffuseWeightHalf ), wrapRGB );",
	"	#else",
	"		float pointDiffuseWeight = max( dotProduct, 0.0 );",
	"	#endif",
	"	pointDiffuse += diffuse * pointLightColor[ i ] * pointDiffuseWeight * lDistance;",
	"	}",
	"}",
	"totalDirect += pointDiffuse;",
	"#endif",

	// temp vars used in shadows
	"	vec3 thisLight;",
	"	int shadowMapIndex;",

	// directional
	"#if MAX_DIR_LIGHTS > 0",
	"vec3 dirDiffuse = vec3( 0.0 );",

	"for ( int i = 0; i < MAX_DIR_LIGHTS; i ++ ) {", //
	"	if (i < actualDirLights) {",		
	"	vec4 lDirection = viewMatrix * vec4( directionalLightDirection[ i ], 0.0 );",
	"	vec3 dirVector = normalize( lDirection.xyz);",
	"   #ifdef BILLBOARD",
	"   float dotProduct = 1.0;",
	"   #else",
	"	float dotProduct = dot( vertexNormal, dirVector );",
	"   #endif",
	"	#ifdef WRAP_AROUND",
	"		float dirDiffuseWeightFull = max( dotProduct, 0.0 );",
	"		float dirDiffuseWeightHalf = max( 0.5 * dotProduct + 0.5, 0.0 );",
	"		vec3 dirDiffuseWeight = mix( vec3( dirDiffuseWeightFull ), vec3( dirDiffuseWeightHalf ), wrapRGB );",
	"	#else",
	"		float dirDiffuseWeight = max( dotProduct, 0.0 );",
	"	#endif",
	"	thisLight = diffuse * directionalLightColor[ i ] * dirDiffuseWeight;",
	"#ifdef USE_SHADOWMAP",
	"	shadowMapIndex = directionalLightShadowMap[ i ];",
	"	if (shadowMapIndex != 0) {",
	"		thisLight = thisLight * getShadowColor(shadowMapIndex - 1, mPosition);",
	"	}",
	"#endif",
	"	dirDiffuse += thisLight;",
	"	}",
	"}",
	"totalDirect += dirDiffuse;",
	"#endif",

	"#if MAX_SPOT_LIGHTS > 0",
	"vec3 spotDiffuse = vec3( 0.0 );",
	"for ( int i = 0; i < MAX_SPOT_LIGHTS; i ++ ) {", //
	"	if (i < actualSpotLights) {",		
	"	vec4 lPosition = viewMatrix * vec4( spotLightPosition[ i ], 1.0 );",
	"	vec3 lVector = lPosition.xyz - mvPosition.xyz;//lPosition.xyz + vViewPosition.xyz;",
	"	float lDistance = 1.0;",
	"	if ( spotLightDistance[ i ] > 0.0 )",
	"		lDistance = 1.0 - min( ( length( lVector ) / spotLightDistance[ i ] ), 1.0 );",
	"	lVector = normalize( lVector );",
	"	float spotEffect = dot( spotLightDirection[ i ], normalize( spotLightPosition[ i ] - mPosition.xyz ) );",
	"	if ( spotEffect > spotLightAngleCos[ i ] ) {",
	"		spotEffect = max( pow( max( spotEffect, 0.0 ), spotLightExponent[ i ] ), 0.0 );",
			// diffuse
	"       #ifdef BILLBOARD",
	"       float dotProduct = 1.0;",
	"       #else",
	"	    float dotProduct = dot( vertexNormal, lVector );",
	"       #endif",
	"		#ifdef WRAP_AROUND",
	"			float spotDiffuseWeightFull = max( dotProduct, 0.0 );",
	"			float spotDiffuseWeightHalf = max( 0.5 * dotProduct + 0.5, 0.0 );",
	"			vec3 spotDiffuseWeight = mix( vec3( spotDiffuseWeightFull ), vec3( spotDiffuseWeightHalf ), wrapRGB );",
	"		#else",
	"			float spotDiffuseWeight = max( dotProduct, 0.0 );",
	"		#endif",
	"		thisLight = diffuse * spotLightColor[ i ] * spotDiffuseWeight * lDistance * spotEffect;",
	"#ifdef USE_SHADOWMAP",
	"		shadowMapIndex = spotLightShadowMap[ i ];",
	"		if (shadowMapIndex != 0) {",
	"			thisLight = thisLight * getShadowColor(shadowMapIndex - 1, mPosition);",
	"		}",			
	"#endif",
	"		spotDiffuse += thisLight;",
	"	}",
	"	}",
	"}",
	"totalDirect += spotDiffuse;",
	"#endif",

	// hemi
	"#if MAX_HEMI_LIGHTS > 0",
	"vec3 hemiDiffuse = vec3( 0.0 );",
	"for ( int i = 0; i < MAX_HEMI_LIGHTS; i ++ ) {", //
	"	if (i < actualHemiLights) {",		
	"	vec4 lDirection = viewMatrix * vec4( hemisphereLightDirection[ i ], 0.0 );",
	"	vec3 lVector = normalize( lDirection.xyz );",
	"   #ifdef BILLBOARD",
	"   float dotProduct = 1.0;",
	"   #else",
	"	float dotProduct = dot( vertexNormal, lVector );",
	"   #endif",
	"	float hemiDiffuseWeight = 0.5 * dotProduct + 0.5;",
	"	vec3 hemiColor = mix( hemisphereLightGroundColor[ i ], hemisphereLightSkyColor[ i ], hemiDiffuseWeight );",
	"	hemiDiffuse += diffuse * hemiColor;",
	"	}",
	"}",
	"totalAmbient += hemiDiffuse;",
	"#endif",
	
	"vec3 totalDiffuse = mix(totalAmbient + totalDirect, diffuse, brightness);",

	"float depth = gl_FragCoord.z / gl_FragCoord.w;",
	"float fogFactor = smoothstep( fogNear, fogFar, depth );",

	"gl_FragColor = vec4(mix(totalDiffuse + addColor, fogColor, fogFactor), 1.0);",

	"}"
	].join( "\n" )	
};

THREE.MeshPixelBoxMaterial = function ( params ) {

	function param ( pname, defaultValue ) { if ( params && params[ pname ] != undefined ) return params[ pname ]; return defaultValue; }

	var material = new THREE.ShaderMaterial( {
		uniforms:       THREE.UniformsUtils.merge( [ THREE.UniformsLib[ 'shadowmap' ], THREE.UniformsLib[ 'lights' ], THREE.PixelBoxMeshShader.uniforms ] ),
		attributes:     THREE.PixelBoxMeshShader.attributes,
		vertexShader:   THREE.PixelBoxMeshShader.vertexShader,
		fragmentShader: THREE.PixelBoxMeshShader.fragmentShader,
		defines: param( 'defines', {} ),
		transparent: false,
		lights: true,
		fog: true
	});
	
	var uniforms = material.uniforms;
	uniforms.tintColor.value.set( param( 'tint', 0xffffff ) );
	uniforms.addColor.value.set( param( 'addColor', 0x0 ) );
	uniforms.tintAlpha.value = param( 'alpha', 1.0 );
	uniforms.brightness.value = param( 'brightness', 0.0 );
	
	// share uniforms with prototype
	uniforms.actualHemiLights = THREE.PixelBoxUtil.material.uniforms.actualHemiLights;
	uniforms.actualDirLights = THREE.PixelBoxUtil.material.uniforms.actualDirLights;
	uniforms.actualPointLights = THREE.PixelBoxUtil.material.uniforms.actualPointLights;
	uniforms.actualSpotLights = THREE.PixelBoxUtil.material.uniforms.actualSpotLights;
	uniforms.directionalLightShadowMap = THREE.PixelBoxUtil.material.uniforms.directionalLightShadowMap;
	uniforms.spotLightShadowMap = THREE.PixelBoxUtil.material.uniforms.spotLightShadowMap;
	
	Object.defineProperty( material, 'tint', {
		get: function () { return this.uniforms.tintColor.value; },
		set: function ( v ) { this.uniforms.tintColor.value.copy( v ); }
	} );
	Object.defineProperty( material, 'addColor', {
		get: function () { return this.uniforms.addColor.value; },
		set: function ( v ) { this.uniforms.addColor.value.copy( v ); }
	} );
	Object.defineProperty( material, 'alpha', {
		get: function () { return this.uniforms.tintAlpha.value; },
		set: function ( v ) { this.uniforms.tintAlpha.value = v; }
	} );
	Object.defineProperty( material, 'alphaThresh', {
		get: function () { return this.uniforms.alphaThresh.value; },
		set: function ( v ) { this.uniforms.alphaThresh.value = v; }
	} );
	Object.defineProperty( material, 'brightness', {
		get: function () { return this.uniforms.brightness.value; },
		set: function ( v ) { this.uniforms.brightness.value = v; }
	} );
	Object.defineProperty( material, 'stipple', {
		get: function () { return this.uniforms.stipple.value; },
		set: function ( v ) { this.uniforms.stipple.value = v; }
	} );
	Object.defineProperty( material, 'map', {
		get: function () { return this.uniforms.map.value; },
		set: function ( v ) { this.uniforms.map.value = v; this.slice = this._slice; this.needsUpdate = true; }
	} );
	// slice property
	Object.defineProperty( material, 'slice', {
		get: function () { return this._slice; },
		set: function ( v ) {
			this._slice = v;
			var uni = this.uniforms;
			if ( v && uni.map.value ) {

				var texture = this.uniforms.map.value;
				var tw = texture.image.width;
				var th = texture.image.height;
				uni.uvSliceRect.value = {
					x: v.spriteColorRect.x / v.spriteSourceSize.x,
					y: 1.0 - v.spriteColorRect.y / v.spriteSourceSize.y,
					z: (v.spriteColorRect.x + v.spriteColorRect.width) / v.spriteSourceSize.x,
					w: 1.0 - (v.spriteColorRect.y + v.spriteColorRect.height) / v.spriteSourceSize.y };
				uni.uvSliceOffset.value = {
					x: v.textureRect.x / tw,
					y: 1.0 - v.textureRect.y / th,
					z: v.textureRect.width / tw,
					w: v.textureRect.height / th };
				uni.uvSliceSizeIsRotated.value = {
					x: v.spriteSourceSize.x / tw,
					y: v.spriteSourceSize.y / th,
					z: v.textureRotated ? 1.0 : 0.0 };

			} else { // full texture

				uni.uvSliceRect.value = { x: 0, y: 1, z: 1, w: 0 };
				uni.uvSliceOffset.value = { x: 0, y: 1, z: 1, w: 1 };
				uni.uvSliceSizeIsRotated.value = { x: 1, y: 1, z: 0 };

			}

			//console.log( {uvSliceRect: uni.uvSliceRect.value, uvSliceOffset: uni.uvSliceOffset.value, uvSliceSizeIsRotated: uni.uvSliceSizeIsRotated.value });
		}
	} );

	return material;
		
};

THREE.PixelBox = function ( data ) {

	function param ( pname, defaultValue ) { if ( data[ pname ] != undefined ) return data[ pname ]; return defaultValue; }

	// clone base materials
	var material = THREE.PixelBoxUtil.material.clone();
	var depthMaterial = THREE.PixelBoxUtil.depthMaterial.clone();
	
	// share uniforms with prototype
	material.uniforms.viewPortScale = THREE.PixelBoxUtil.material.uniforms.viewPortScale;
	material.uniforms.actualHemiLights = THREE.PixelBoxUtil.material.uniforms.actualHemiLights;
	material.uniforms.actualDirLights = THREE.PixelBoxUtil.material.uniforms.actualDirLights;
	material.uniforms.actualPointLights = THREE.PixelBoxUtil.material.uniforms.actualPointLights;
	material.uniforms.actualSpotLights = THREE.PixelBoxUtil.material.uniforms.actualSpotLights;
	material.uniforms.directionalLightShadowMap = THREE.PixelBoxUtil.material.uniforms.directionalLightShadowMap;
	material.uniforms.spotLightShadowMap = THREE.PixelBoxUtil.material.uniforms.spotLightShadowMap;
			
	// share unforms with depth material
	depthMaterial.uniforms.viewPortScale = THREE.PixelBoxUtil.material.uniforms.viewPortScale;
	depthMaterial.uniforms.tintAlpha = material.uniforms.tintAlpha;
	depthMaterial.uniforms.pointSize = material.uniforms.pointSize;
	
	// these uniforms' defaults come from data object
	material.uniforms.occlusion.value = param( 'occlusion', 1.0 );
	material.uniforms.pointSize.value = param( 'pointSize', 1.0 );
	material.uniforms.cullBack.value = param( 'cullBack', true );
		
	// create geometry
	var geometry = new THREE.BufferGeometry();
	
	// create pivot
	this._pivot = new THREE.Vector3( data.width * 0.5, data.height * 0.5, data.depth * 0.5 );
	
	// bounding sphere respect pivot
	geometry.computeBoundingSphere = function () {
	
		if ( this.geometry.boundingSphere === null ) {
		
			this.geometry.boundingSphere = new THREE.Sphere();
			
		}
		
		this.geometry.boundingSphere.center.set(
			this.geometry.data.width * 0.5 - this._pivot.x,
			this.geometry.data.height * 0.5 - this._pivot.y,
			this.geometry.data.depth * 0.5 - this._pivot.z
		);
		
		this.geometry.boundingSphere.radius = 0.5 * Math.max( this.geometry.data.width, this.geometry.data.depth, this.geometry.data.height );
		
	}.bind( this );

	// bounding box respect pivot
	geometry.computeBoundingBox = function () {
	
		if ( this.geometry.boundingBox === null ) this.geometry.boundingBox = new THREE.Box3();

		this.geometry.boundingBox.min.set( 0,0,0 );
		this.geometry.boundingBox.max.set( this.geometry.data.width, this.geometry.data.height, this.geometry.data.depth );
		this.geometry.boundingBox.translate( this._pivot.clone().multiplyScalar( -1 ) );
		
	}.bind( this );
	
	// process data
	THREE.PixelBoxUtil.processPixelBoxFrames( data );
	
	// init as PointCloud
	THREE.PointCloud.call( this, geometry, material );

	this.customDepthMaterial = depthMaterial;
	this.castShadow = true;
	this.pixelBox = true;
	
	// create anchors
	this.anchors = {};
	if ( data.anchors ) {
	
		for ( var aname in data.anchors ) {
		
			if ( aname == 'PIVOT' ) { 
			
				this._pivot.set( data.anchors[ aname ][ 0 ].x, data.anchors[ aname ][ 0 ].y, data.anchors[ aname ][ 0 ].z );
				continue;
				
			}
			
			var obj3d = new THREE.Object3D();
			obj3d.isContainer = true;
			obj3d.detached = false;
			obj3d.isAnchor = true;
			obj3d.name = aname;
			obj3d.visible = false;
			this.add( obj3d );
			this.anchors[ aname ] = obj3d;
			
		}
		
	} else {
	
		data.anchors = {};
		
	}
	
	// create frame setter on pointcloud
	geometry.data = data;
	geometry._frame = -1;
	
	Object.defineProperty( this, 'frame', {
		get: (function () { return this.geometry._frame; }),
		set: (function ( f ) {
		
			var geom = this.geometry;
			var data = geom.data;
			 
			// validate frame
			if ( f == geom._frame || !data.frameData || !data.frameData.length ) return;
			if ( f < 0 ) f = data.frameData.length + ( f % data.frameData.length );
			f = f % data.frameData.length;
			geom._frame = f;
			
			// init buffer if needed
			var fd = data.frameData[ f ];
			
			if ( fd.p ) {
			
				// add attributes
				geom.addAttribute( 'position', fd.p );
				geom.addAttribute( 'color', fd.c );
				geom.addAttribute( 'normal', fd.n );
				geom.addAttribute( 'occlude', fd.o );
				
				// create buffers if needed
				if ( !fd.p.buffer ) {
				
					var _gl = renderer.webgl.context;
					
					for ( var name in geom.attributes ) {
					
						var bufferType = ( name === 'index' ) ? _gl.ELEMENT_ARRAY_BUFFER : _gl.ARRAY_BUFFER;
						var attribute = geom.attributes[ name ];
						
						if ( !attribute.buffer ) {
						
							attribute.buffer = _gl.createBuffer();
							var res = _gl.bindBuffer( bufferType, attribute.buffer );
							_gl.bufferData( bufferType, attribute.array, _gl.STATIC_DRAW );
							
						}
						
					}
					
				}
				
			}
			
			// set offset/length
			// regular frame
			if ( fd.s != undefined ) {
			
				geom.offsets = [ { index: fd.s, count: fd.l } ];
				
			// no offsets stored, use full range (editor)
			} else if ( fd.o ) {
			
				geom.offsets = [];
				
			}
			
			var ev = { type:'frame', frame: f };
			this.dispatchEvent( ev );
			
			var degToRad = Math.PI / 180.0;
			
			// update anchors
			for ( var aname in this.anchors ) {
			
				var anchor = this.anchors[ aname ];
				var adata = data.anchors[ aname ][ f ];
				
				if ( !anchor.detached ) {
				
					anchor.visible = !!adata.on;
					anchor.position.set( adata.x - this._pivot.x, adata.y - this._pivot.y, adata.z - this._pivot.z );
					anchor.rotation.set( adata.rx * degToRad, adata.ry * degToRad, adata.rz * degToRad );
					anchor.scale.set( adata.sx || 0.00001, adata.sy || 0.00001, adata.sz || 0.00001 );
					anchor.updateMatrixWorld( true );
					
					if ( adata.meta.length ) {
					
						var ev = { type:'anchor-meta', frame:f, anchor: anchor, meta:adata.meta };
						this.dispatchEvent( ev );
						
					}
					
				}
				
			}
		
		} )
		
	} );	
	
	// set frame / anim params
	this.vertexBufferStart = 0;
	this.vertexBufferLength = 0;
	if( data.frameData ) { 
	
		this.frame = 0;
		this.totalFrames = data.frameData.length;
		
	}

	// dispose function
	this.dispose = function ( unloadAsset ) {
	
		if ( this.geometry ) {
		
			if ( unloadAsset || ( this.geometry.data && !this.geometry.data.name ) ) {
			
				if ( this.geometry.data ) {
				
					THREE.PixelBoxUtil.dispose( this.geometry.data );
					delete this.geometry.data;
					
				}
				
				this.geometry.dispose();
				
			}
			
			delete this.geometry;
			this.material.dispose();
			this.customDepthMaterial.dispose();
		}
		
	};
	
	// add animation functions
	this.currentAnimation = null;
	this._animSpeed = 1.0;
	
	Object.defineProperty( this, 'animSpeed', {
		get: function () { return this._animSpeed; },
		set: function ( v ) {
		
			this._animSpeed = v;
			
			// reset timer
			if ( this._animationInterval && this.currentAnimation ) {
			
				var nextFrameIn = 1.0 / (Math.abs( v ? v : 0.001 ) * this.currentAnimation.fps);
				this._animationInterval = nextFrameIn;
				renderer.animQueue.adjustTime( this.advanceAnimationFrame, nextFrameIn );
				
			}
			
		}
		
	} );
	
	this._animationInterval = 0;
	this._animLoops = -1;
	this._currentAnimationPosition = 0;
	
	Object.defineProperty( this, 'currentAnimationPosition', {
		get: function () { return this._currentAnimationPosition; },
		set: function ( v ) { // set frame according to anim position
		
			v = Math.min( 1, Math.max( 0, v ) );
			var f =  Math.min( this.currentAnimation.length - 1, Math.floor( v * this.currentAnimation.length ) );
			
			if ( this.animSpeed < 0 ) { // backwards
			
				f = this.currentAnimation.length - 1 - f;
				
			}
			
			this._currentAnimationPosition = v;
			this.frame = f + this.currentAnimation.start;
			
		}
		
	} );
	
	// pre-bind
	this.advanceAnimationFrame = THREE.PixelBox.prototype.advanceAnimationFrame.bind( this );
	
	this.addEventListener( 'removed', this.stopAnim );
	
	// add shorthand accessors
	Object.defineProperty( this, 'asset', {
		get: function () { return this.geometry.data; }
	} );
	
	Object.defineProperty( this, 'alpha', {
		get: function () { return this.material.uniforms.tintAlpha.value; },
		set: function ( v ) { this.material.uniforms.tintAlpha.value = v; }
	} );
	
	Object.defineProperty( this, 'tint', {
		get: function () { return this.material.uniforms.tintColor.value; },
		set: function ( v ) { this.material.uniforms.tintColor.value.copy( v ); }
	} );

	Object.defineProperty( this, 'addColor', {
		get: function () { return this.material.uniforms.addColor.value; },
		set: function ( v ) { this.material.uniforms.addColor.value.copy( v ); }
	} );

	Object.defineProperty( this, 'occlusion', {
		get: function () { return this.material.uniforms.occlusion.value; },
		set: function ( v ) { this.material.uniforms.occlusion.value = v; }
	} );

	Object.defineProperty( this, 'pointSize', {
		get: function () { return this.material.uniforms.pointSize.value; },
		set: function ( v ) { this.material.uniforms.pointSize.value = v; }
	} );
	
	Object.defineProperty( this, 'stipple', {
		get: function () { return this.material.uniforms.stipple.value; },
		set: function ( v ) { this.material.uniforms.stipple.value = v; }
	} );
	
	Object.defineProperty( this, 'cullBack', {
		get: function () { return !!this.material.uniforms.cullBack.value; },
		set: function ( v ) { this.material.uniforms.cullBack.value = v ? 1 : 0; }
	} );
	
	// create particles
	if ( data.particles !== undefined ) {
	
		var pos = [];
		var clr = [];
		var nrm = [];
		var occ = [];
		
		for ( var i = 0; i < data.particles; i++ ) {
		
			pos.push( 0, 0, 0 );
			clr.push( 1, 1, 1, 1 );
			nrm.push( 0, 1, 0 );
			occ.push( 0 );
			
		}
			
		data.frameData.push( { 	p: new THREE.BufferAttribute( new Float32Array( pos ), 3 ),
								c: new THREE.BufferAttribute( new Float32Array( clr ), 4 ),
								n: new THREE.BufferAttribute( new Float32Array( nrm ), 3 ),
								o: new THREE.BufferAttribute( new Float32Array( occ ), 1 ) } );
								
		this.geometry._frame = -1; // invalidate
		this.frame = 0; // refresh
		this.geometry.computeBoundingSphere();

		// trace individual particles
		this.raytraceBoundingBoxOnly = false;

	} else if ( data && data.width ) {

		this.geometry.computeBoundingBox();

		// trace bounding box ( faster )
		this.raytraceBoundingBoxOnly = true;

	}
	
	return this;
	
}

THREE.PixelBox.prototype = Object.create( THREE.PointCloud.prototype );
THREE.PixelBox.prototype.constructor = THREE.PixelBox;

/* 
	Animation functions 

	Animations are implemented using setTimeout, and are automatically paused/resumed when renderer.pause(bPause) is called
	Animation is stopped when this PixelBox is removed from parent
	Animations have intrinsic FPS propery, which is multiplied by this PixelBox's .animSpeed (which can be negative for reverse animations)
		
	Functions:

		playAnim(animname, [ BOOL fromCurrentFrame ]) - plays animation once. fromCurrentFrame is true to start animation from current position
		loopAnim(animName, [ INT numLoops | Infinity, [BOOL fromCurrentFrame] ] ) - plays animation numLoops times. Specify Infinity constant 
																					to play forever. fromCurrentFrame is true to start animation 
																					from current position
		gotoAndStop(animname, [ FLOAT PosWithinAnim | INT frameNumber]) - seeks position within animation and stops. Position can be a float between
																		  0.0 and <1.0 or an integer frame number.
																		  
    Animation functions emit events (subscribe to events by calling obj.addEventListener(eventType, func) - see THREE.EventDispatcher)
    
	    frame			- dispatched each time a frame is changed
		anchor-meta 	- dispatched whenever anchor has meta data on current frame
		anim-meta		- dispatched when an animation with meta data starts playing
		anim-stop		- dispatched whenever animation is stopped
		anim-start		- dispatched whenever animation is started
		anim-loop		- dispatched when animation loops around
		anim-finish		- dispatched when an animation completes

*/

THREE.PixelBox.prototype.advanceAnimationFrame = function () {

	this._animationInterval = 0;
	
	var nextFrameIn = 1.0 / ( Math.abs( this.animSpeed ? this.animSpeed : 0.001 ) * this.currentAnimation.fps);
	var keepGoing = true;
	
	var step = this.currentAnimation.length > 1 ? (1.0 / (this.currentAnimation.length - 1)) : 1;
	this.currentAnimationPosition += step;
	this._animationInterval = 0;
	
	// end of anim
	if ( this.currentAnimationPosition == 1 ) {
	
		// was looping
		if ( this._animLoops > 0 ) {
		
			var ev = { type:'anim-loop', anim:this.currentAnimation, loop: this._animLoops };
			this.dispatchEvent( ev );
			this._animLoops--;
			this._currentAnimationPosition = -step;
			
		// end of animation
		} else {
		
			keepGoing = false;
			var ev = { type:'anim-finish', anim:this.currentAnimation };
			this.dispatchEvent( ev );
			
		}
		
	}
	
	// set up next time
	if (keepGoing) {
	
		this._animationInterval = nextFrameIn;
		renderer.animQueue.enqueue( this.advanceAnimationFrame, nextFrameIn );
		
	}
};

THREE.PixelBox.prototype.playAnim = function ( animName, fromCurrentFrame ) {

	this.loopAnim( animName, 0, fromCurrentFrame );
	
};

THREE.PixelBox.prototype.loopAnim = function ( animName, numLoops, fromCurrentFrame ) {

	var anim = this.geometry.data.anims[ animName ];
	
	if ( !anim ) {
	 
		console.log( "Animation " + animName + " not found in ", this.data );
		return;
		
	}
	
	if ( this._animationInterval ) {
	
		// same anim, from current frame	
		if ( this.currentAnimation == anim && this._animLoops > 0 ) { 
		
			this._animLoops = numLoops;
			return;
			
		}
		
		this.stopAnim();
		
	}
	
	// current anim
	this.currentAnimation = anim;
	this._animLoops = (numLoops === undefined ? Infinity : numLoops);
	
	// set up first frame
	if ( fromCurrentFrame && this.frame >= anim.start && this.frame < anim.start + anim.length ) {
	
		if ( this.animSpeed >= 0 ) {
		
			this.currentAnimationPosition = (this.frame - anim.start) / anim.length;
			
		} else {
		
			this.currentAnimationPosition = 1.0 - (this.frame - anim.start) / anim.length;
		}
		
	} else {
	
		this.currentAnimationPosition = 0;
		
	}
	
	var ev = { type:'anim-start', anim:this.currentAnimation };
	this.dispatchEvent( ev );
	
	// anim meta
	if ( this.currentAnimation.meta.length ) {
	
		ev = { type:'anim-meta', anim:this.currentAnimation, meta:anim.meta };
		this.dispatchEvent(ev);
		
	}
	
	// set up timeout
	var nextFrameIn = 1.0 / (Math.abs( this.animSpeed ) * anim.fps);
	this._animLoops--;
	this._animationInterval = nextFrameIn;
	renderer.animQueue.enqueue( this.advanceAnimationFrame, nextFrameIn );
	
};

THREE.PixelBox.prototype.gotoAndStop = function ( animName, positionWithinAnimation ) {

	var anim = this.geometry.data.anims[ animName ];
	var diff = (this.currentAnimation != anim);
	positionWithinAnimation = (positionWithinAnimation === undefined ? 0 : positionWithinAnimation);
	
	if ( !anim ) { 
	
		console.log( "Animation " + animName + " not found in ", this.data ); 
		return;
		
	}
	
	if ( this._animationInterval ) {
	
		this.stopAnim();
		
	}
	
	// stop
	if ( diff ) {
	
		var ev = { type:'anim-stop', anim:this.currentAnimation };
		this.dispatchEvent( ev );
		
	}
	
	// current anim
	this.currentAnimation = anim;
	this.currentAnimationPosition = (positionWithinAnimation < 1.0 ? positionWithinAnimation : ((positionWithinAnimation / anim.length) % 1.0));
	this._animLoops = -1;	

	// anim meta
	if ( diff && anim.meta.length ) {
	
		var ev = { type:'anim-meta', anim:anim, meta:anim.meta };
		this.dispatchEvent( ev );
		
	}
	
};

THREE.PixelBox.prototype.animNamed = function ( animName ) {

	return this.geometry.data.anims[ animName ];
	
};

THREE.PixelBox.prototype.stopAnim = function () {
	
	if ( this._animationInterval ) {
	
		renderer.animQueue.cancel( this.advanceAnimationFrame );
		this._animationInterval = 0;
		
	}
	
	if ( this.currentAnimation ) {
	
		var ev = { type:'anim-stop', anim:this.currentAnimation };
		this.dispatchEvent( ev );
		this.currentAnimation = null;
		
	}
	
};

/* 
	Particle effects
	
	callBack(pobj) is called for each point
	
	pobj is:
	{ i: particleIndex, p: position, n: normal, c: color, a: alpha, o: occlusion, b: brightness }
	
	set values in pobj to update particle
	
	this can be used to generate snow, rain, etc.
	Example:
	
	snow = new THREE.PixelBox( { particles: 1000, width: 100, depth: 100, height: 100, pointSize: 0.3 } );
	snow.updateFrameWithCallback(this.updateSnow, { timePassed: timePassed } );
	
*/

THREE.PixelBox.prototype.updateFrameWithCallback = function ( callBack, extraParam ) {

	var geometry = this.geometry;
	var dataObject = geometry.data;
	var frameBuffers = dataObject.frameData[ 0 ];
	var addr = 0;
	var pobj = {
		p: new THREE.Vector3(),
		n: new THREE.Vector3(),	
		c: new THREE.Color(),
		a: 0.0,
		b: 1.0, 
		o: 0.0
	};
	
	var numParticles = dataObject.particles;
	for ( addr = 0; addr < numParticles; addr++ ) {
	
		pobj.i = addr;
		pobj.p.set( frameBuffers.p.array[ addr * 3 ], frameBuffers.p.array[ addr * 3 + 1 ], frameBuffers.p.array[ addr * 3 + 2 ] );
		pobj.n.set( frameBuffers.n.array[ addr * 3 ], frameBuffers.n.array[ addr * 3 + 1 ], frameBuffers.n.array[ addr * 3 + 2 ] );
		pobj.b = pobj.n.length() - 1.0;
		pobj.n.normalize();
		pobj.o = frameBuffers.o.array[ addr ];
		pobj.c.setRGB( frameBuffers.c.array[ addr * 4 ], frameBuffers.c.array[ addr * 4 + 1 ], frameBuffers.c.array[ addr * 4 + 2 ] );
		pobj.a = frameBuffers.c.array[ addr * 4 + 3 ];

		// call
		callBack( pobj, extraParam );
		
		// copy back
		frameBuffers.p.array[ addr * 3 ] = pobj.p.x;
		frameBuffers.p.array[ addr * 3 + 1 ] = pobj.p.y;
		frameBuffers.p.array[ addr * 3 + 2 ] = pobj.p.z;
		
		frameBuffers.o.array[ addr ] = pobj.o;
		
		pobj.n.multiplyScalar( 1.0 + pobj.b );
		frameBuffers.n.array[ addr * 3 ] = pobj.n.x;
		frameBuffers.n.array[ addr * 3 + 1 ] = pobj.n.y;
		frameBuffers.n.array[ addr * 3 + 2 ] = pobj.n.z;
		
		frameBuffers.c.array[ addr * 4 ] = pobj.c.r;
		frameBuffers.c.array[ addr * 4 + 1 ] = pobj.c.g;
		frameBuffers.c.array[ addr * 4 + 2 ] = pobj.c.b;
		frameBuffers.c.array[ addr * 4 + 3 ] = pobj.a;
		
	}
	
	frameBuffers.c.needsUpdate = true;
	frameBuffers.n.needsUpdate = true;
	frameBuffers.o.needsUpdate = true;
	frameBuffers.p.needsUpdate = true;
	
};

THREE.PixelBox.prototype.appendPixelBox = function ( other ) {
	
	if ( this.geometry._frame != -1 ) { 
		
		console.log( "Unable to append - geometry already committed." );
		return;
		
	}
	
	if ( !this.geometry.data.frameData ) this.geometry.data.frameData = [];

	if ( !this.geometry.boundingBox ) this.geometry.boundingBox = new THREE.Box3();
	if ( !this.geometry.boundingSphere ) this.geometry.boundingSphere = new THREE.Sphere();	
	
	other.updateMatrixWorld( true );

	// transform other's points by mat
	var mat = other.matrixWorld.clone();
	var inv = new THREE.Matrix4();
	inv.getInverse( this.matrixWorld );
	//mat.multiply( inv );
	inv.multiply( mat );
	mat.copy( inv );

	// append points
	
	var pos = [];
	var clr = [];
	var nrm = [];
	var occ = [];
	
	var frameData = other.geometry.data.frameData[ 0 ];
	var index = other.geometry.offsets.length ? other.geometry.offsets[ 0 ].index : 0;
	var end = index + (other.geometry.offsets.length ? other.geometry.offsets[ 0 ].count : frameData.o.array.length);

	var p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector4(), o, nd, ab, m;
	
	for ( var i = index; i < end; i++ ) {
	
		// load 
		p.set( frameData.p.array[ i * 3 ], frameData.p.array[ i * 3 + 1 ], frameData.p.array[ i * 3 + 2 ] );
		n.set( frameData.n.array[ i * 3 ], frameData.n.array[ i * 3 + 1 ], frameData.n.array[ i * 3 + 2 ] );
		c.set( frameData.c.array[ i * 4 ], frameData.c.array[ i * 4 + 1 ], frameData.c.array[ i * 4 + 2 ], frameData.c.array[ i * 4 + 3 ] );
		o = frameData.o.array[ i ] * other.occlusion;
		
		// transform pos
		p.applyMatrix4( mat );
		nd = n.length();

		// bake color
		var ab = Math.max( other.addColor.r, other.addColor.g, other.addColor.b );
		c.x = c.x * other.tint.r + other.addColor.r * ab;
		c.y = c.y * other.tint.g + other.addColor.g * ab;
		c.z = c.z * other.tint.b + other.addColor.b * ab;
		c.w = c.w * other.alpha;

		// transform normal
		n.normalize().transformDirection( mat ).multiplyScalar( Math.min( 2, nd + ab ) );
		
		// store
		pos.push( p.x, p.y, p.z );
		clr.push( c.x, c.y, c.z, c.w );
		nrm.push( n.x, n.y, n.z );
		occ.push( o );
		
		// update bounding box
		m = this.geometry.boundingBox.min;
		m.set( Math.min( m.x, p.x ), Math.min( m.y, p.y ), Math.min( m.z, p.z ) );
		m = this.geometry.boundingBox.max;
		m.set( Math.max( m.x, p.x ), Math.max( m.y, p.y ), Math.max( m.z, p.z ) );

		// update bounding sphere		
		m = this.geometry.boundingSphere.radius;
		this.geometry.boundingSphere.radius = Math.max( m, p.length() );
	}
	
	this.geometry.data.frameData.push( { p: pos, n: nrm, c: clr, o: occ } );
	
}

/*

	Raytracing


*/

THREE.PixelBox.prototype.raycast = ( function () {

	var inverseMatrix = new THREE.Matrix4();
	var ray = new THREE.Ray();
	var vec = new THREE.Vector3();
	var vec2 = new THREE.Vector3();
	var position = new THREE.Vector3();

	return function ( raycaster, intersects ) {

		var object = this;
		var geometry = object.geometry;

		inverseMatrix.getInverse( this.matrixWorld );
		ray.copy( raycaster.ray ).applyMatrix4( inverseMatrix );

		if ( geometry.boundingBox !== null ) {

			var intersectPoint = ray.intersectBox( geometry.boundingBox, vec );
			if ( intersectPoint ) {

				if ( this.raytraceBoundingBoxOnly ) {

					vec2 = ray.closestPointToPoint( intersectPoint, vec2 );
					vec2.applyMatrix4( object.matrixWorld );

					intersects.push( {

						distance: raycaster.ray.origin.distanceTo( vec2 ),
						point: intersectPoint.clone(),
						object: object

					} );
					return;

				}

			} else {

				return;

			}

		}

		var localThreshold = 1.2 / Math.max( 0.0001, Math.min( this.scale.x, this.scale.y, this.scale.z ) );
		var testPoint = function ( point, index ) {

			var rayPointDistance = ray.distanceToPoint( point );

			if ( rayPointDistance < localThreshold ) {

				var intersectPoint = ray.closestPointToPoint( point );
				intersectPoint.applyMatrix4( object.matrixWorld );

				var distance = raycaster.ray.origin.distanceTo( intersectPoint );

				intersects.push( {

					distance: distance,
					distanceToRay: rayPointDistance,
					point: intersectPoint.clone(),
					index: index,
					object: object

				} );

				return true;

			}

			return false;

		};

		var positions = geometry.attributes.position.array;
		var pointStart = 0;
		var pointCount = positions.length / 3;

		if ( geometry.offsets && geometry.offsets.length ) {

			pointStart = geometry.offsets[ 0 ].index;
			pointCount = geometry.offsets[ 0 ].count;
		}

		for ( var i = pointStart, l = pointStart + pointCount; i < l; i ++ ) {

			position.set(
				positions[ 3 * i ],
				positions[ 3 * i + 1 ],
				positions[ 3 * i + 2 ]
			);

			testPoint( position, i );

		}

	};

}() );


/* 

	PixelBoxUtil namespace
	
*/

THREE.PixelBoxUtil = {};

THREE.PixelBoxUtil.material = new THREE.ShaderMaterial( {
	uniforms:       THREE.UniformsUtils.merge( [ THREE.UniformsLib[ 'shadowmap' ], THREE.UniformsLib[ 'lights' ], THREE.PixelBoxShader.uniforms ] ),
	attributes:     THREE.PixelBoxShader.attributes,
	vertexShader:   THREE.PixelBoxShader.vertexShader,
	fragmentShader: THREE.PixelBoxShader.fragmentShader,
	transparent: false,
	lights: true,
	fog: true
} );

THREE.PixelBoxUtil.depthMaterial = new THREE.ShaderMaterial( {
	uniforms:       THREE.PixelBoxDepthShader.uniforms,
	vertexShader:   THREE.PixelBoxDepthShader.vertexShader,
	fragmentShader: THREE.PixelBoxDepthShader.fragmentShader
});

THREE.PixelBoxUtil.depthMaterial._shadowPass = true;

THREE.PixelBoxUtil.meshDepthMaterial = new THREE.ShaderMaterial( {
	uniforms:       THREE.PixelBoxMeshDepthShader.uniforms,
	vertexShader:   THREE.PixelBoxMeshDepthShader.vertexShader,
	fragmentShader: THREE.PixelBoxMeshDepthShader.fragmentShader
});

THREE.PixelBoxUtil.meshDepthMaterial._shadowPass = true;


THREE.PixelBoxUtil.updateViewPortUniform = function ( optCamera ) {

	// get cam scale	
	var camWorldScale = new THREE.Vector3();
	
	// viewPortScale is based on the camera
	function getValueForCam ( cam ) {
	
		camWorldScale.setFromMatrixScale( cam.matrixWorld );
		
		// perspective camera
		if ( cam instanceof THREE.PerspectiveCamera ) {
		
			return (renderer.webgl.domElement.height / (2 * Math.tan( 0.5 * cam.fov * Math.PI / 180.0 ))) / camWorldScale.x;
			
		// ortho
		} else {
		
			return (cam.zoom * renderer.webgl.domElement.height / (cam.top * 2)) / camWorldScale.x;
			
		}
		
	}
	
	var val = 1;
	
	if ( renderer.scene instanceof THREE.PixelBoxSceneTransition && renderer.scene.sceneA instanceof THREE.PixelBoxScene ) {
	
		var t = renderer.scene.smoothTime;
		var val1 = getValueForCam( renderer.scene.sceneB.camera );
		val = getValueForCam( renderer.scene.sceneA.camera );
		val = val + (val1 - val) * t;
		
	} else if ( optCamera ) {
	
		val = getValueForCam( optCamera );
		
	} else if ( renderer.currentScene && renderer.currentScene.camera ) {
	
		val = getValueForCam( renderer.currentScene.camera );
		
	}
	
	THREE.PixelBoxUtil.material.uniforms.viewPortScale.value = val;
	
};

THREE.PixelBoxUtil.dispose = function ( data ) {

	if ( data && data.frameData ) {
	
		var _gl = renderer.webgl.context;
		
		for ( var f = 0; f < data.frameData.length; f++ ) {
		
			if ( !data.frameData[ f ][ 'p' ] ) continue; // skip empty
			
			for ( var key in data.frameData[ f ] ) {
			
				if ( data.frameData[ f ][ key ].buffer !== undefined ) {
				
					_gl.deleteBuffer( data.frameData[ f ][ key ].buffer );
					delete data.frameData[ f ][ key ];
					
				}
				
			}
			
		}
		
		delete data.frameData;
		
		if ( data.name && assets.files[ data.name ] == data ) assets.remove( data.name );
		
	}
	
};

/*
	Decodes & processes frames if frames haven't been processed yet
	Alters data object itself
*/

THREE.PixelBoxUtil.processPixelBoxFrames = function ( data ) {

	if ( data.frames === null || data.particles !== undefined ) {
	
		// special case for PixelBox editor or particle systems
		data.frameData = [];
		return true;
		
	// parse data for the first time (modifies data object)
	} else if ( data.frames ) {
	
		if ( !data.frames.length ) return false;
	
		// pivot
		var pivot = new THREE.Vector3();
		
		if ( data.anchors && data.anchors[ 'PIVOT' ] ) {
		
			pivot.set( data.anchors[ 'PIVOT' ][ 0 ].x, data.anchors[ 'PIVOT' ][ 0 ].y, data.anchors[ 'PIVOT' ][ 0 ].z );
			
		} else {
		
			pivot.set( data.width * 0.5, data.height * 0.5, data.depth * 0.5 );
			
		}		
	
		// decode frames
		if ( !data.frameData ) {
		
			data.frameData = [];
			
			for ( var f = 0; f < data.frames.length; f++ ) {
			
				data.frameData[ f ] = THREE.PixelBoxUtil.decodeFrame( data, f );
				
			}
			
			THREE.PixelBoxUtil.finalizeFrames( data, pivot );
			
		}
		
		// change anims to an object
		if ( _.isArray( data.anims ) ) {
		
			var anims = {};
			for ( var i = 0; i < data.anims.length; i++ ) {
			
				anims[ data.anims[ i ].name ] = data.anims[ i ];
				
			}
			
			data.anims = anims;
			
		}
		
		// clean up
		delete data.frames;
		return true;
		
	}
	
	return false;
	
};

/* 	
	Updates shared light uniforms
	call when the number of lights, or number of lights casting shadows has changed 
	
	Shader uses directionalLightShadowMap & spotLightShadowMap to tell which shadow map belongs to which light
	to generate better shadows
*/

THREE.PixelBoxUtil.updateLights = function ( scene, updateAllMaterials ) {	
	
	var uniforms = THREE.PixelBoxUtil.material.uniforms;
	uniforms.actualHemiLights.value = 0;
	uniforms.actualDirLights.value = 0;
	uniforms.actualPointLights.value = 0;
	uniforms.actualSpotLights.value = 0;
	uniforms.directionalLightShadowMap.value.length = 0;
	uniforms.spotLightShadowMap.value.length = 0;

	var shadowMapIndex = 0;
	
	scene.traverse( function ( obj ) {
	
		if ( obj.visible ) {
		
			if ( obj instanceof THREE.SpotLight ) {
			
				uniforms.actualSpotLights.value++;
				
				if ( obj.castShadow && renderer.webgl.shadowMapEnabled ) {
				
					uniforms.spotLightShadowMap.value.push( ++shadowMapIndex );
					
				} else uniforms.spotLightShadowMap.value.push( 0 );
				
			} else if ( obj instanceof THREE.DirectionalLight ) {
			
				uniforms.actualDirLights.value++;
				
				if ( obj.castShadow && renderer.webgl.shadowMapEnabled ) { 
				
					uniforms.directionalLightShadowMap.value.push( ++shadowMapIndex );
					
				} else uniforms.directionalLightShadowMap.value.push( 0 );
				
			} else if ( obj instanceof THREE.HemisphereLight ) {
			
				uniforms.actualHemiLights.value++;
				
			} else if ( obj instanceof THREE.PointLight ) {
			
				uniforms.actualPointLights.value++;
				
			}
			
		}
		
		if ( updateAllMaterials && obj.material ) obj.material.needsUpdate = true;
		
	} );
	
	if ( !uniforms.directionalLightShadowMap.value.length ) {
	
		uniforms.spotLightShadowMap.value.push( 0 );
		
	}
	
	if ( !uniforms.spotLightShadowMap.value.length ) {
	
		uniforms.spotLightShadowMap.value.push( 0 );
		
	}
	
};

/* 
	Decodes a single frame for PixelBox from dataObject
	
	dataObject format:
	{ 	
		name, 						name to add to assets or null to not cache
		width, height, depth,		fixed dimensions
		optimize,					true to carve out pixels inside model
		smoothNormals,				0.0 - 1.0 normal averaging factor (1.0 is default)
		frames						array
	}
	
	first frame is the following format:
		
		FULL FRAME format is string of (width * height * depth) concatenated values as follows
		
			RRGGBBab where 
				RRGGBB is hex color
				a is hex for alpha (0 = 0.0, F = 1.0)
				b is hex for self-illumination (same)
	
	consecutive frames are in the following format:
	
		DELTA format is relative to previous frame, meant to only replace pixels that 
			have changed from previous frame. Any number of concatenated values as follows
				
			IIIIIIRRGGBBab where 
				I is a hex number - index of the pixel that is different from previous frame
				the rest of the values are the same as FULL FRAME
	
	during decoding, each frame will be replaced with an array of (width * height * depth) for faster lookups
	of elements { c: hexcolor, a: floatAlpha, b: floatBrightness }
		
*/

THREE.PixelBoxUtil.decodeFrame = function ( dataObject, frameIndex ) {

	var smoothNormals = dataObject.smoothNormals != undefined ? dataObject.smoothNormals : 1.0;
	var floor = dataObject.floor != undefined ? dataObject.floor : false;
	var optimize = dataObject.optimize != undefined ? dataObject.optimize : true;

	var positions = [];
	var colors = [];
	var normals = [];
	var occlusion = [];
	var width = dataObject.width, height = dataObject.height, depth = dataObject.depth;
	var hw = width * 0.5, hh = height * 0.5, hd = depth * 0.5;

	var frameData = dataObject.frames[ frameIndex ];
	var prevFrameData = null;
	var assembledFrameData = [];
	var isRaw = (typeof( dataObject.frames[ 0 ] ) == 'object' && dataObject.frames[ 0 ][ 'p' ] != undefined);
	var isDeltaFormat = frameIndex > 0;
	
	if ( isRaw ) {
	
		positions = frameData.p;
		colors = frameData.c;
		normals = frameData.n;
		occlusion = frameData.o;
		
	} else {
	
		if ( isDeltaFormat ) {
		
			frameData = frameData.match( /.{14}/g );
			var pi = frameIndex - 1;
			
			while ( !prevFrameData ) {
			
				prevFrameData = dataObject.frames[ pi ];
				pi--;
				
			}
			
		} else {
		
			frameData = frameData.match( /.{8}/g );
			
		}
		
		// no changes from prev frame 
		var sameAsLast = false;
		
		if ( frameData === null ) { 
		
			frameData = [];
			sameAsLast = true;
			
		}
		var chunk, temp, pixel, optimizeRemoved = 0, index = 0;
		var colorObj = new THREE.Color();
		var perp = new THREE.Vector3(), normal = new THREE.Vector3(), tilted = new THREE.Vector3();
	
		// decode and assemble current frame
		for ( var x = 0; x < width; x++ ) {
		for ( var y = 0; y < height; y++ ) {
		for ( var z = 0; z < depth; z++ ) {
		
			// delta
			if ( isDeltaFormat ) {
			
				pixel = prevFrameData[ index ];
				pixel = { c: pixel.c, a: pixel.a, b: pixel.b }; // copied
				assembledFrameData.push( pixel );
				
			// full format	
			} else {
			
				// parse pixel
				chunk = frameData[ index ];
				pixel = { 
					c: parseInt( chunk.substr( 0, 6 ), 16 ), 
					a: parseInt( chunk.substr( 6, 1 ), 16 ) / 15.0, 
					b: parseInt( chunk.substr( 7, 1 ), 16 ) / 15.0
				};
				assembledFrameData.push( pixel );
				
			}
		
			index++;
			
		}}}
		
		if ( isDeltaFormat ) {
		
			for ( index = 0; index < frameData.length; index++ ) {
			
				chunk = frameData[ index ];
				temp = parseInt( chunk.substr( 0,6 ), 16 );
				assembledFrameData[ temp ] = {
					c: parseInt( chunk.substr( 6,6 ), 16 ),
					a: parseInt( chunk.substr( 12,1 ), 16 ) / 15.0,
					b: parseInt( chunk.substr( 13,1 ), 16 ) / 15.0
				};
				
			}
			
		}
		
		// update dataObject with decoded frame data
		if ( !sameAsLast ) dataObject.frames[ frameIndex ] = assembledFrameData;
		
		if (sameAsLast) return null;
	
		// helper
		function getNorm ( x, y, z, dx, dy, dz ) {
		
			x += dx; y += dy; z += dz;
			var oobxz = (x < 0 || z < 0 || x >= width || z >= depth);
			var ooby = (y < 0 || y >= height);
			if ( floor && oobxz ) return new THREE.Vector3( 0, 0, 0 );
			if ( oobxz || ooby || assembledFrameData[ (x * depth * height) + (y * depth) + z ].a == 0.0 ) return new THREE.Vector3( dx, dy, dz );
			return new THREE.Vector3( 0, 0, 0 );
		}
	
		// helper
		function getAlpha ( x, y, z ) {
		
			var ii = (x * depth * height) + (y * depth) + z;
			
			if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) return 0;
			
			return assembledFrameData[ ii ].a;
			
		}
		
		// ready to populate buffers
		index = 0;
		var neighbors;
		
		for ( var x = 0; x < width; x++ ) {
		for ( var y = 0; y < height; y++ ) {
		for ( var z = 0; z < depth; z++ ) {
		
			if ( assembledFrameData[ index ].a == 0.0 ) { 
			
				index++;
				continue;
				
			}
			
			// collect nearest neighbors
			neighbors = [ getAlpha( x - 1, y, z ), getAlpha( x + 1, y, z ), getAlpha( x, y - 1, z ), getAlpha( x, y + 1, z ), getAlpha( x, y, z - 1 ), getAlpha( x, y, z + 1 ) ];
			var numNeighbors = 	Math.floor( neighbors[ 0 ] ) + Math.floor( neighbors[ 1 ] ) + Math.floor( neighbors[ 2 ] ) +
								Math.floor( neighbors[ 3 ] ) + Math.floor( neighbors[ 4 ] ) + Math.floor( neighbors[ 5 ] );
								
			// optimize - discard pixel if can't be seen inside the cloud
			if ( optimize && numNeighbors == 6 && // <- nearest neighbors
				getAlpha( x - 2, y, z ) + getAlpha( x + 2, y, z ) + getAlpha( x, y - 2, z ) +
				getAlpha( x, y + 2, z ) + getAlpha( x, y, z - 2 ) + getAlpha( x, y, z + 2 ) == 6 // <- extended neighbors
			) {
			
				// if pixel is surrounded by completely opaque pixels, it can be discarded
				optimizeRemoved++;
				index++;
				continue;
				
			}
			
			// start normal
			if ( numNeighbors > 2 ) {
			
				normal = !floor ? (new THREE.Vector3( x - hw, y - hh, z - hd )) : (new THREE.Vector3( 0, 1, 0 ));
				normal.normalize().multiplyScalar( 0.1 );
				
			} else {
			
				normal = new THREE.Vector3( 0, 1, 0 );
				
			}
			
			// direct
			normal.add( getNorm( x, y, z, 1, 0, 0 ) );
			normal.add( getNorm( x, y, z, -1, 0, 0 ) );
			normal.add( getNorm( x, y, z, 0, 1, 0 ) );
			normal.add( getNorm( x, y, z, 0, -1, 0 ) );
			normal.add( getNorm( x, y, z, 0, 0, 1 ) );
			normal.add( getNorm( x, y, z, 0, 0, -1 ) );
			
			var weight;
			
			if ( smoothNormals > 0.0 ) {
			
				// two over
				weight = 0.25 * smoothNormals;
				normal.add(getNorm( x, y, z, 2, 0, 0 ).multiplyScalar( weight ) );
				normal.add(getNorm( x, y, z, -2, 0, 0 ).multiplyScalar( weight ) );
				normal.add(getNorm( x, y, z, 0, 2, 0 ).multiplyScalar( weight ) );
				normal.add(getNorm( x, y, z, 0, -2, 0 ).multiplyScalar( weight ) );
				normal.add(getNorm( x, y, z, 0, 0, 2 ).multiplyScalar( weight ) );
				normal.add(getNorm( x, y, z, 0, 0, -2 ).multiplyScalar( weight ) );
		
				// diagonals
				weight = 0.4 * smoothNormals;
				normal.add(getNorm( x, y, z, 1, 1, 0 ).multiplyScalar( weight ) );
				normal.add(getNorm( x, y, z, 0, 1, 1 ).multiplyScalar( weight ) );
				normal.add(getNorm( x, y, z, 1, 1, 1 ).multiplyScalar( weight ) );
				normal.add(getNorm( x, y, z, -1, -1, 0 ).multiplyScalar( weight ) );
				normal.add(getNorm( x, y, z, 0, -1, -1 ).multiplyScalar( weight ) );
				normal.add(getNorm( x, y, z, -1, -1, -1 ).multiplyScalar( weight ) );
				
			}
			
			// normalize
			if ( normal.length() == 0 ) normal.set( 0, 1, 0 );
			else normal.normalize();
			
			// occlusion
			// sample neighbors first
			var occ = 0.0;
			
			if ( numNeighbors > 2 ) {
			
				weight = 0.125;
				
				// add direct neighbors
				for ( var n = 0; n < 6; n++ ) occ += neighbors[ n ];
				occ *= 0.25 / 6.0;
				
				// sample in direction of the normal		
				occ += 1.0 * getAlpha( Math.round( x + normal.x ), Math.round( y + normal.y ), Math.round( z + normal.z ) );
				
				// find a perpendicular vector
				ax = Math.abs( normal.x ); ay = Math.abs( normal.y ); az = Math.abs( normal.z );
				mv = Math.min( ax, ay, az );
				if ( mv == ax ) {
				
					perp.set( 1, 0, 0 );
					
				} else if ( mv == ay ) {
				
					perp.set( 0, 1, 0 );
					
				} else {
				
					perp.set( 0, 0, 1 );
					
				}
				
				perp.cross( normal ).normalize();
				
				// narrow cone
				tilted.copy( normal ).applyAxisAngle( perp, Math.PI * 0.2 ).normalize().multiplyScalar( 2 );
				occ += weight * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
	
				// wider cone
				tilted.copy(normal).applyAxisAngle(perp, Math.PI * 0.35).normalize().multiplyScalar(3.5);
				occ += weight * 0.5 * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * 0.5 * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * 0.5 * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * 0.5 * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * 0.5 * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * 0.5 * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * 0.5 * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
				tilted.applyAxisAngle( normal, Math.PI * 0.25 );
				occ += weight * 0.5 * getAlpha( Math.round( x + tilted.x ), Math.round( y + tilted.y ), Math.round( z + tilted.z ) );
	
				occ /= 3;
				
			} else {
			
				occ = -numNeighbors * 0.25;
				
			}
			
			occlusion.push( occ );
		
			// store brightness in normal length, after occlusion step
			normal.multiplyScalar( 1.0 + assembledFrameData[ index ].b );
				
			// color
			colorObj.set( assembledFrameData[ index ].c );
			colors.push( colorObj.r, colorObj.g, colorObj.b, assembledFrameData[ index ].a );
			
			// position
			positions.push( x, y, z );
			
			// normal
			normals.push( normal.x, normal.y, normal.z ); 
					
			index++;
			
		}}}

	}
	
	return { p: positions, c: colors, n: normals, o: occlusion };
	
};

/*
	Finalizes loaded frames by concatenating frameData entries and creating BufferAttribute 
	objects in first frame + storing frame offsets.
	
	Called after all decodeFrame have been completed.
	
	end result - dataObject.frameData[] contains
	{p:posAttr, c:colorAttr, n:normAttr, o:occlusionAttr, s:startOffset, l:length }; (all BufferAttributes)
	for the first frame and { s:startOffset, l:length } for consecutive frames (referring to 0 frame)

*/

THREE.PixelBoxUtil.finalizeFrames = function ( dataObject, pivot, singleFrame ) {

	var ffd = dataObject.frameData[ 0 ];
	var curOffset = 0;
	var lastNonEmpty = 0;
	for ( var f = 0; f < dataObject.frameData.length; f++ ) {
	
		var fd = dataObject.frameData[ f ];
		
		// store offset
		// non-empty
		if ( fd ) {
		
			lastNonEmpty = f;
			fd.s = curOffset;
			fd.l = fd.o.length;
			curOffset += fd.o.length;
			
		// empty (same as previous)
		} else {
		
			dataObject.frameData[ f ] = dataObject.frameData[ lastNonEmpty ];
			
		}
		
		// concat arrays
		if ( f && fd ) {
		
			ffd.p = ffd.p.concat( fd.p );
			ffd.c = ffd.c.concat( fd.c );
			ffd.n = ffd.n.concat( fd.n );
			ffd.o = ffd.o.concat( fd.o );
			delete fd.p;
			delete fd.c;
			delete fd.n;
			delete fd.o;
			
		}
		
	}
	
	// offset by pivot
	for ( var i = 0, l = ffd.p.length; i < l; i += 3 ) {
	
		ffd.p[ i ] -= pivot.x;
		ffd.p[ i + 1 ] -= pivot.y;
		ffd.p[ i + 2 ] -= pivot.z;
		
	}
	
	if ( singleFrame && dataObject.frameData.length > 1 ) {
		
		dataObject.frameData.splice( 1, dataObject.frameData.length - 1 );
		
		ffd.s = 0;
		ffd.l = ffd.o.length;
		
	}
	
	// create buffers
	ffd.p = new THREE.BufferAttribute( new Float32Array( ffd.p ), 3 );
	ffd.c = new THREE.BufferAttribute( new Float32Array( ffd.c ), 4 );
	ffd.n = new THREE.BufferAttribute( new Float32Array( ffd.n ), 3 );
	ffd.o = new THREE.BufferAttribute( new Float32Array( ffd.o ), 1 );
	
};

/* 
	Encodes/appends a single frame into dataObject
	
	dataObject must have the following fields 
	{ 	
		width, height, depth,		fixed dimensions
		frames						array
	}
	
	frameData must be an array of width * height * depth elements of the following form
	{ c: hexcolor, a: floatAlpha, b: floatBrightness } or null for empty pixels
	
	if there are already frames in frames array, it will use DELTA, otherwise FULL FRAME format
	
	after finishing encoding all frames, delete dataObject.assembledFrames property (used while encoding for delta lookups)
*/

THREE.PixelBoxUtil.encodeFrame = function ( frameData, dataObject ) {

	// current frame number
	var frameIndex = dataObject.frames.length;

	// add assembledFrame
	if ( dataObject.assembledFrames === undefined ) dataObject.assembledFrames = [];
	
	dataObject.assembledFrames.push( frameData );
	
	var combine = [];
	var prevFramePixel;
	
	// begin encode	
	var index = 0;	
	for ( var x = 0; x < dataObject.width; x++ ) {
	for ( var y = 0; y < dataObject.height; y++ ) {
	for ( var z = 0; z < dataObject.depth; z++ ) {
	
		// pixel
		var fd = frameData[ index ];
		fd = fd ? fd : { c:0, a:0, b:0 };
		var c = ('00000' + (new Number( fd.c )).toString( 16 )).substr( -6 );
		var a = (new Number(Math.floor( fd.a * 15.0 ))).toString( 16 );
		var b = (new Number(Math.floor( fd.b * 15.0 ))).toString( 16 );
		
		// delta
		if ( frameIndex ) {
		
			// compare with previous
			prevFramePixel = dataObject.assembledFrames[ frameIndex - 1 ][ index ];
			prevFramePixel = prevFramePixel ? prevFramePixel : { c:0, a:0, b:0 };
			
			if ( prevFramePixel.c != fd.c || prevFramePixel.a != fd.a || prevFramePixel.b != fd.b ) {
			
				combine.push( ('00000' + (new Number( index )).toString( 16 )).substr( -6 ) + c + a + b );
				
			}
			
		// full
		} else {
		
			combine.push( c + a + b );
			
		}
		
		index++;
		
	}}}
	
	dataObject.frames.push( combine.join( '' ) );
	
};

/*
	XML parsing function
*/

THREE.PixelBoxUtil.parseXml = function() {

	var parseXml = null;

	if ( typeof window.DOMParser != "undefined" ) {

		parseXml = function ( xmlStr ) {

			return ( new window.DOMParser() ).parseFromString( xmlStr, "text/xml" );

		};

	} else if ( typeof window.ActiveXObject != "undefined" && new window.ActiveXObject( "Microsoft.XMLDOM" ) ) {

		parseXml = function ( xmlStr ) {

			var xmlDoc = new window.ActiveXObject( "Microsoft.XMLDOM" );
			xmlDoc.async = "false";
			xmlDoc.loadXML( xmlStr );
			return xmlDoc;

		};

	}

	return parseXml;

}();

THREE.PixelBoxUtil.parsePlist = function( xmlStr ) {

	var xml = THREE.PixelBoxUtil.parseXml( xmlStr );

	function getNodeVal ( val ) {

		switch( val.nodeName.toLowerCase() ) {
			case 'dict':
				return parseDict( val );

			case 'string':
				var cont = val.textContent;

				if ( cont.substr( 0, 1 ) == '{' ) {

					// {{x, y}, {w, h}}
					var matches = cont.match( /\{\{(-?\d+),\s?(-?\d+)\},\s?\{(-?\d+),\s?(-?\d+)\}\}/ );
					if ( matches && matches.length == 5 ) {

						return {
							x: parseInt( matches[ 1 ] ),
							y: parseInt( matches[ 2 ] ),
							width: parseInt( matches[ 3 ] ),
							height: parseInt( matches[ 4 ] )
						};

					}
					//{x, y}
					matches = cont.match( /\{(-?\d+),\s?(-?\d+)\}/ );
					if ( matches && matches.length == 3 ) {

						return {
							x: parseInt( matches[ 1 ] ),
							y: parseInt( matches[ 2 ] )
						};

					}
				}

				return cont;

			case 'true':
				return true;

			case 'false':
				return false;

			case 'integer':
				return parseInt( val.textContent );

			case 'array':
				var children = val.childNodes;
				var arr = [];
				for ( var i = 0; i < children.length; i ++ ) {

					// skip text nodes
					if ( children[ i ].nodeType != 3 ) {

						arr.push( getNodeVal( children[ i ] ) );

					}

				}
				return arr;

		}

	};

	function parseDict ( dict ) {

		var children = dict.childNodes;
		var obj = {};

		for ( var i = 0; i < children.length; i ++ ) {

			if ( children[ i ].nodeType != 3 ) {

				// got key
				var key = children[ i ].textContent;

				// find value
				i++;
				while ( i < children.length - 1 && children[ i ].nodeType == 3 ) i++;
				var val = getNodeVal( children[ i ] );

				obj[ key ] = val;

			}

		}

		return obj;

	};

	var dictNode;
	for( var i in xml.documentElement.childNodes ) {
		if ( xml.documentElement.childNodes[ i ].nodeName == 'dict' ) {
			dictNode = xml.documentElement.childNodes[ i ];
			break;
		}
	}
	var obj = parseDict( dictNode );

	return obj;

}
