function PreviewScene(){

	this.useComposer = false;

	THREE.PixelBoxScene.call(this); // parent constructor
	
/* populate scene */

	this.onAdded = function(){
		setTimeout( function(){
			if(window.opener && window.loadScene){
				this.populateWith(JSON.parse(window.loadScene));
			}
			
			this.updateMatrixWorld(true);
			this.controls = new THREE.EditorControls(this.camera, renderer.webgl.domElement);
			this.controls.center.set(0, 0, -100);
			this.camera.localToWorld(this.controls.center);
			this.controls.panEnabled = this.controls.rotateEnabled = this.controls.zoomEnabled = true;
			
			renderer._windowResized();

			/*
			var s = new THREE.FxSprite();
			s.castShadow = s.receiveShadow = true;
			s.textureMap = 'hog.png';
			s.fxData = 'hog.json';
			window.s = s;
			this.add( s );
			 */

		}.bind(this), 500);		
	};
}

/* extends Scene */
PreviewScene.prototype = Object.create(THREE.PixelBoxScene.prototype);
PreviewScene.prototype.constructor = PreviewScene;

/* called on document load */
$(document).ready(function(){
	// init renderer
	if(!renderer.init(1.0, true)){ // scale, stats
		var err = "Your browser doesn't support WebGL";
		alert(err);
		console.error(err);
		return;
	} else {
		console.log("WebGL initialized");
	}
	
	window.previewScene = new PreviewScene();
	renderer.setScene(window.previewScene);
});