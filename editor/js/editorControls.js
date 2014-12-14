/**
 * @author qiao / https://github.com/qiao
 * @author mrdoob / http://mrdoob.com
 * @author alteredq / http://alteredqualia.com/
 * @author WestLangley / http://github.com/WestLangley
 */

THREE.EditorControls = function ( object, domElement ) {

	domElement = ( domElement !== undefined ) ? domElement : document;

	// API

	this.panEnabled = false;
	this.rotateEnabled = false;
	this.zoomEnabled = false;
	this.center = new THREE.Vector3();

	// internals

	var scope = this;
	var vector = new THREE.Vector3();

	var STATE = { NONE: -1, ROTATE: 0, ZOOM: 1, PAN: 2 };
	var state = STATE.NONE;

	var center = this.center;
	var normalMatrix = new THREE.Matrix3();
	var pointer = new THREE.Vector2();
	var pointerOld = new THREE.Vector2();

	// events

	var changeEvent = { type: 'change' };

	this.focus = function ( target, frame ) {

		var scale = new THREE.Vector3();
		target.matrixWorld.decompose( center, new THREE.Quaternion(), scale );

		if ( frame && target.geometry ) {

			scale = ( scale.x + scale.y + scale.z ) / 3;
			center.add(target.geometry.boundingSphere.center.clone().multiplyScalar( scale ));
			var radius = target.geometry.boundingSphere.radius * ( scale );
			var pos = object.position.clone().sub( center ).normalize().multiplyScalar( radius * 2 );
			object.position.copy( center ).add( pos );

		}

		object.lookAt( center );

		scope.dispatchEvent( changeEvent );

	};
	
	this.busy = function(){ return state != STATE.NONE && state != STATE.PAN; };

	this.pan = function ( distance ) {

		normalMatrix.getNormalMatrix( object.matrix );

		distance.applyMatrix3( normalMatrix );
		distance.multiplyScalar( vector.copy( center ).sub( object.position ).length() * 0.001 );

		object.position.add( distance );
		center.add( distance );

		scope.dispatchEvent( changeEvent );

	};

	this.zoom = function ( distance ) {

		normalMatrix.getNormalMatrix( object.matrix );

		distance.applyMatrix3( normalMatrix );
		distance.multiplyScalar( vector.copy( center ).sub( object.position ).length() * 0.001 );

		object.position.add( distance );

		scope.dispatchEvent( changeEvent );

	};

	this.rotate = function ( delta ) {

		vector.copy( object.position ).sub( center );

		var theta = Math.atan2( vector.x, vector.z );
		var phi = Math.atan2( Math.sqrt( vector.x * vector.x + vector.z * vector.z ), vector.y );

		theta += delta.x;
		phi += delta.y;

		var EPS = 0.000001;

		phi = Math.max( EPS, Math.min( Math.PI - EPS, phi ) );

		var radius = vector.length();

		vector.x = radius * Math.sin( phi ) * Math.sin( theta );
		vector.y = radius * Math.cos( phi );
		vector.z = radius * Math.sin( phi ) * Math.cos( theta );

		object.position.copy( center ).add( vector );

		object.lookAt( center );

		scope.dispatchEvent( changeEvent );

	};

	// mouse

	function onMouseDown( event ) {
		if(event.target.nodeName != 'CANVAS' && !$(event.target).hasClass('object-label')) return;
		
		if ( event.button === 0 && scope.rotateEnabled) {

			state = STATE.ROTATE;

		} else if ( event.button === 1 && scope.zoomEnabled) {

			state = STATE.ZOOM;

		} else if ( event.button === 2 && scope.panEnabled) {

			state = STATE.PAN;

		}

		if(state == STATE.NONE) return;

		event.preventDefault();
		
		pointerOld.set( event.clientX, event.clientY );

		domElement.addEventListener( 'mousemove', onMouseMove, false );
		domElement.addEventListener( 'mouseup', onMouseUp, false );
		// domElement.addEventListener( 'mouseout', onMouseUp, false );
		domElement.addEventListener( 'dblclick', onMouseUp, false );

	}

	function onMouseMove( event ) {
		
		// if ( scope.enabled === false ) return;
 
		event.preventDefault();

		pointer.set( event.clientX, event.clientY );

		var movementX = pointer.x - pointerOld.x;
		var movementY = pointer.y - pointerOld.y;

		if ( state === STATE.ROTATE ) {

			scope.rotate( new THREE.Vector3( - movementX * 0.005, - movementY * 0.005, 0 ) );

		} else if ( state === STATE.ZOOM ) {

			scope.zoom( new THREE.Vector3( 0, 0, movementY ) );

		} else if ( state === STATE.PAN ) {

			scope.pan( new THREE.Vector3( - movementX, movementY, 0 ) );

		}

		pointerOld.set( event.clientX, event.clientY );

		if(!window.editorHidden){
			window.editorHidden = true;
			$('.editor.ui-widget-header').hide();
		}
	}

	function onMouseUp( event ) {
		if(event.target.nodeName != 'CANVAS' && !$(event.target).hasClass('object-label')) return;

		domElement.removeEventListener( 'mousemove', onMouseMove, false );
		domElement.removeEventListener( 'mouseup', onMouseUp, false );
		// domElement.removeEventListener( 'mouseout', onMouseUp, false );
		domElement.removeEventListener( 'dblclick', onMouseUp, false );

		state = STATE.NONE;
		
		if(window.editorHidden){
			window.editorHidden = false;
			$('.editor.ui-widget-header').show();
		}
	}

	function onMouseWheel( event ) {
		if(event.target.nodeName != 'CANVAS' && !$(event.target).hasClass('object-label')) return;
		
		if ( !scope.zoomEnabled ) return;
		
		event.preventDefault();

		var delta = 0;

		if ( event.wheelDelta ) { // WebKit / Opera / Explorer 9

			delta = - event.wheelDelta;

		} else if ( event.detail ) { // Firefox

			delta = event.detail * 10;

		}

		scope.zoom( new THREE.Vector3( 0, 0, delta ) );

	}

	domElement.addEventListener( 'contextmenu', function ( event ) { if(event.target.nodeName != 'CANVAS' && event.target.className != 'object-label') return; event.preventDefault(); }, false );
	domElement.addEventListener( 'mousedown', onMouseDown, false );
	domElement.addEventListener( 'mousewheel', onMouseWheel, false );
	domElement.addEventListener( 'DOMMouseScroll', onMouseWheel, false ); // firefox

};

THREE.EditorControls.prototype = Object.create( THREE.EventDispatcher.prototype );
