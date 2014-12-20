function PreviewScene(){

	Scene.call(this); // parent constructor
	
/* scene think */

	this.tick = function(delta){
		Scene.prototype.tick.call(this, delta); // super.tick
		
		this.controls.update(delta);
	};
	
/* scene callbacks */
	
	this.onAdded = function(){
		Scene.prototype.onAdded.call(this);
		$('body').append('<div style="position:absolute; top: 10px; left: 10px; padding: 5px; color:#fff; text-align: center;\
							background-color:rgba(0,0,0,0.5);">\
							W A S D to move<br/>R F move up / down<br/>Arrow keys to look</div>');
	};
	
	this.onWillRemove = function(){
		Scene.prototype.onWillRemove.call(this);
	};
	
	this.onRemoved = function(){
		Scene.prototype.onRemoved.call(this);
	};	
	
/* populate scene */

	this.onWillAdd = function(){
		Scene.prototype.onWillAdd.call(this);
		
		if(window.opener && window.loadScene){
			this.populateWith(JSON.parse(window.loadScene));
		}
		this.controls = new THREE.FlyControls(this.camera, renderer.webgl.domElement);
		this.controls.movementSpeed = 100;
		this.controls.rollSpeed = 0.9;
		this.controls.dragToLook = true;
	};
}

/* extends Scene */
PreviewScene.prototype = Object.create(Scene.prototype);
PreviewScene.prototype.constructor = PreviewScene;

/* called on document load */
$(document).ready(function(){
	// init renderer
	if(!renderer.init(2.0, true)){ // scale, stats
		var err = "Your browser doesn't support WebGL";
		alert(err);
		console.error(err);
		return;
	} else {
		console.log("WebGL initialized");
	}
	
	previewScene = new PreviewScene();
	renderer.setScene(previewScene);
});