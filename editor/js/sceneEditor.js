/*

	Clickable HTML Text labels on screen with object names? (for easier obj picking)

	Properties:
		Scene:
			Clear color
			Fog values
			
	
	Decouple camera from main camera?
	To be able to have multiple?
	
	When an anchored object is removed, its .anchored flag should be cleared?
*/

function EditSceneScene(){
	
	this.initUndo();
	
	this.shift = false;
	this.ctrl = false;
	this.alt = false;
	
	this.mouseCoord = {x: 0, y: 0};
		
	this.canvasInteractionsEnabled = true;
	this.disableCanvasInteractionsOnRelease = false;
}

EditSceneScene.prototype = {

/* ------------------- ------------------- ------------------- ------------------- ------------------- Mouse handling */
	
	mouseDown:function(e){
		// ignore right button
		if(e.button === 2 || !this.canvasInteractionsEnabled || e.target.className == 'object-label') return;
		
		// blur input boxes
		if(e.target.nodeName.toLowerCase()=='canvas') editScene.blur();

		this.lazyMouse = new THREE.Vector2(e.pageX, e.pageY);
		/*if(this._pasteMode && this.intersectingPaste && !this.ctrl){
			this.startPasteMove();
		} else if(this.canStroke) { 
			this.startStroke();
		} else if(this.movingMaskEnabled && this.intersectingMask){
			this.startMaskMove();
		}*/
	},

	mouseUp:function(e){
		/*
		if(this.stroking){
			this.finishStroke();
		} else if(this.movingMask){
			this.finishMaskMove();
		} else if(this.movingPaste){
			this.finishPasteMove();
		} 
		*/
		
		if(this.disableCanvasInteractionsOnRelease){
			this.disableCanvasInteractions();
			this.disableCanvasInteractionsOnRelease = false;
		}
		
		// hide opened menus
		$('.submenu').hide();
		
		if(window.editorHidden){
			window.editorHidden = false;
			$('.editor.ui-widget-header').show();
		}
	},

	mouseMove:function(e){
		this.mouseCoord = { x: e.pageX, y: e.pageY };
		/*
		// trace ray
		var screenPoint = new THREE.Vector3((this.mouseCoord.x / window.innerWidth ) * 2 - 1, -(this.mouseCoord.y / window.innerHeight ) * 2 + 1, 1.0);
		screenPoint.unproject(this.camera);
		this.raycaster.set(this.camera.position, screenPoint.sub(this.camera.position).normalize());

		// mask intersection
		if(this._pasteMode){
			this.intersectingPaste = this.raycaster.intersectObject(this.paste, false);
			this.intersectingPaste = this.intersectingPaste.length ? this.intersectingPaste[0] : null;
			this.intersectingMask = null;
		} else {
			this.intersectingMask = this.raycaster.intersectObject(this.maskBox, false);
			this.intersectingMask = this.intersectingMask.length ? this.intersectingMask[0] : null;
			this.intersectingPaste = null;
		}
		
		this.canStroke = !this.ctrl && !this.playing && !this.movingMaskEnabled && !this.movingMask && (this.intersectingMask);
		
		if(this.stroking){
			var lazyMouse = new THREE.Vector2(e.pageX, e.pageY);
			var dist = this.lazyMouse.distanceToSquared(lazyMouse);
			if(dist > 5){
				this.lazyMouse = lazyMouse;
				this.continueStroke();
			}
			
			if(!window.editorHidden){
				window.editorHidden = true;
				$('.editor.ui-widget-header').hide();
			}
		} else if(this.movingMask){
			this.continueMaskMove();
			if(!window.editorHidden){
				window.editorHidden = true;
				$('.editor.ui-widget-header').hide();
			}
		} else if(this.movingPaste){
			this.continuePasteMove();
			if(!window.editorHidden){
				window.editorHidden = true;
				$('.editor.ui-widget-header').hide();
			}
		} else if(!(this.controls.busy())) { 
			this.controls.panEnabled = this.controls.zoomEnabled = !(this.movingMask || this.movingMaskEnabled);
			this.controls.rotateEnabled = (!this.intersectingPaste || this.ctrl) && !this.canStroke && this.controls.zoomEnabled;
		}*/
	},

	/* move selection in camera-aligned coord sys */
	moveTool:function(dx, dy){
		// find which plane the camera is aligned with
		var camVector = new THREE.Vector3(0,0, -1);
		var camUp = new THREE.Vector3(0,1,0);
		camVector.applyQuaternion(this.camera.quaternion);
		camUp.applyQuaternion(this.camera.quaternion);

		var planes = [
			new THREE.Vector3(1,0,0),
			new THREE.Vector3(-1,0,0),
			new THREE.Vector3(0,1,0),
			new THREE.Vector3(0,-1,0),
			new THREE.Vector3(0,0,1),
			new THREE.Vector3(0,0,-1) ];

		var minDot = 1, minDotIndex = -1, dot;
		for(var i = 0; i < 6; i++){
			dot = camVector.dot(planes[i]);
			if(dot < minDot){ minDot = dot; minDotIndex = i; }
		}
		
		// additional dots for up/down positions
		var xdot = planes[0].dot(camUp);
		var zdot = planes[4].dot(camUp);
		
		var xdir = new THREE.Vector3(), ydir = new THREE.Vector3();
		switch(minDotIndex){
		case 0: xdir.set(0,0,-1); ydir.set(0,1,0); break;
		case 1: xdir.set(0,0,1); ydir.set(0,1,0); break;
		case 4: xdir.set(1,0,0); ydir.set(0,1,0); break;
		case 5: xdir.set(-1,0,0); ydir.set(0,1,0); break;
		case 2:
			if(Math.abs(zdot) > Math.abs(xdot)){
				if(zdot < 0){
					xdir.set(1,0,0); ydir.set(0,0,-1);
				} else {
					xdir.set(-1,0,0); ydir.set(0,0,1);
				}
			} else {
				if(xdot < 0){
					xdir.set(0,0,-1); ydir.set(-1,0,0);
				} else {
					xdir.set(0,0,1); ydir.set(1,0,0);
				}
			}
			break;
		case 3:
			if(Math.abs(zdot) > Math.abs(xdot)){
				if(zdot < 0){
					xdir.set(-1,0,0); ydir.set(0,0,-1);
				} else {
					xdir.set(1,0,0); ydir.set(0,0,1);
				}
			} else {
				if(xdot < 0){
					xdir.set(0,0,1); ydir.set(-1,0,0);
				} else {
					xdir.set(0,0,-1); ydir.set(1,0,0);
				}
			}
			break;
		}
		
		xdir.multiplyScalar(dx);
		ydir.multiplyScalar(dy);
		var posInc = xdir.clone().add(ydir);
		
		
		/*var selectedAnchor = $('#anchor-list div.selected');
		var anchor = selectedAnchor.length ? this.doc.frames[this._currentFrame].anchors[parseInt(selectedAnchor.attr('id').substr(11))] : null;

		if(this._pasteMode){
			this.paste.position.add(posInc);
			this.updatePasteSpinnersFromPaste();			
		} else if(anchor && anchor.on){
			var updatedAnchor = _.deepClone(anchor);
			var anchorIndex = parseInt(selectedAnchor.attr('id').substr(11));
			
			updatedAnchor.x += posInc.x; updatedAnchor.y += posInc.y; updatedAnchor.z += posInc.z;
			
			// replace last undo's redo if moving the same anchor
			var lastUndo = this._undo.length ? this._undo[this._undo.length - 1] : null;
			if(lastUndo && lastUndo.name == 'Move Anchor' && lastUndo.undo[1] == this._currentFrame && lastUndo.undo[2] == anchorIndex){
				lastUndo.redo[3] = updatedAnchor;
			} else lastUndo = null;
			
			if(!lastUndo){
				this.addUndo({name:'Move Anchor', 	undo:[this.updateAnchor, this._currentFrame, anchorIndex, anchor],
													redo:[this.updateAnchor, this._currentFrame, anchorIndex, updatedAnchor]});
			}
			
			this.doc.frames[this._currentFrame].anchors[anchorIndex] = updatedAnchor;
			$('#anchor-row-'+anchorIndex).trigger('click');// refresh numbers
			
		} else {
			this.maskPosition.add(posInc);
			this.maskPosition.x = Math.max(0, Math.min(this.doc.width - this.maskSize.x, this.maskPosition.x));
			this.maskPosition.y = Math.max(0, Math.min(this.doc.height - this.maskSize.y, this.maskPosition.y));
			this.maskPosition.z = Math.max(0, Math.min(this.doc.depth - this.maskSize.z, this.maskPosition.z));
			this.updateMaskBox();
			this.updateMaskSizeSpinnersFromMask();
		}*/
	},

	
/* ------------------- ------------------- ------------------- ------------------- ------------------- Container & display functions */

	/* called after new doc is created to recreate container with axis */
	createContainer:function(createDefaults){
		// clear container
		if(this.container){
			this.scene.recursiveRemoveChildren([this.camera, this.axis]);
		} else if(!this.axis){
			var axis = this.axis = new THREE.AxisHelper(10);
			axis.raycast = function(){ return; };// skip raycase
			this.scene.add(axis);
		}
		
		this.container = new THREE.Object3D();
		this.scene.add(this.container);
		
		// create default items
		// true if starting new scene from menu
		if(createDefaults){
			// TODO
			// ambient
			// camera
			// direct
		}
	},
	
	resetZoom:function(){
		this.camera.position.set(512, 512, 512);
		this.camera.lookAt(0,0,0);
		this.controls.focus(this.container, true);
	},
	
	/* updates text labels on all elements in container, recursive */
	updateTextLabels: function(cont, depth){
		if(!cont) return;
		var p = new THREE.Vector3();
		for(var i = 0; i < cont.children.length; i++){
			var obj = cont.children[i];
			if(obj.isHelper){
				if(obj['update']) obj.update();
				continue;
			}
			if(!obj.htmlLabel){
				obj.htmlLabel = $('<label id="'+obj.uuid+'" class="object-label" style="color:'+this.automaticColorForIndex(obj.id, 1, false)+'"/>').text(obj.name);
				if(obj.isAnchor) obj.htmlLabel.css({'background-color':'transparent', 'font-size':'8px','font-weight':'normal'});
				obj.htmlLabel.click(this.objectLabelClicked);
				$(document.body).append(obj.htmlLabel);
			}
			p.set(0,0,0);
			obj.localToWorld(p);
			p.project(this.camera);
			var offs = depth * (obj.isAnchor ? -5 : 8);
			obj.htmlLabel.offset({top:Math.floor(window.innerHeight * 0.5 - window.innerHeight * 0.5 * p.y - obj.htmlLabel.height() * 0.5) + offs,
									left:Math.floor(window.innerWidth * 0.5 * p.x + window.innerWidth * 0.5 - obj.htmlLabel.width() * 0.5)} );
			this.updateTextLabels(obj, depth + 1);
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Util */


	/* used during loading */
	populateObject: Scene.prototype.populateObject,
	
	getObjectFromPool:function(){ return null; },
	
	automaticColorForIndex: function(i, alpha, returnColorObject){
		var hue = ((i + (i % 2 ? 5 : 1)) % 10) * 0.1;
		var sat = 0.9 - 0.6 * (Math.floor(i * 0.1) % 5) / 5;
		var color = new THREE.Color();
		color.setHSL(hue, sat, 0.6);
		
		if(returnColorObject) return color;
		
		return 'rgba('+Math.floor(color.r * 255.0)+','+Math.floor(color.g * 255.0)+','+Math.floor(color.b * 255.0)+','+alpha+')';
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Document functions */

	/* clear localStore */
	resetLocalStorage:function(){
		$('<div id="editor-reset" class="editor">\
		<div class="center">This will reset the editor\'s stored preferences and stored "Hold" object.</div>\
		</div>').dialog({
	      resizable: false, width: 400, height:220, modal: true, dialogClass:'no-close', title:"Reset LocalStorage?",
	      buttons: { 
	      "Cancel": function() { 
	      	$(this).dialog("close"); 
	      },
	      "Reset": function() { 
	      	localStorage_clear();
	      	$(this).dialog("close"); 
	      	if(chrome && chrome.storage){
		      	chrome.runtime.reload();
	      	} else {
	      		window.location.reload();
	      	}
	      } },
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
		});
		editScene.disableCanvasInteractions(true);
	},
	
	/* store localStore */
	holdDoc:function(){	
		function doHold(){
			var data = editScene.createDataObject(editScene.doc);
			data = JSON.stringify(data);
			localStorage_setItem('holdScene', data);
		}
		
		if(localStorage_getItem('holdScene')){
			$('<div id="editor-hold" class="editor">\
			<div class="center">This will replace current "Hold" object.</div>\
			</div>').dialog({
		      resizable: false, width: 400, height:220, modal: true, dialogClass:'no-close', title:"Replace Hold?",
		      buttons: { 
		      "Replace": function() { 
		      	doHold();
		      	$(this).dialog("close"); 
		      },
		      "Cancel": function() { 
		      	$(this).dialog("close"); 
		      }
		      },
		      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
			});
			editScene.disableCanvasInteractions(true);
		} else doHold();
	},
	
	/* restore */
	fetchDoc:function(){
		var data = localStorage_getItem('holdScene');
		if(!data) return;
		
		$('<div id="editor-reset" class="editor">\
		<div class="center">Ths will replace current object with the ones stored in "Hold".</div>\
		</div>').dialog({
	      resizable: false, width: 400, height:220, modal: true, dialogClass:'no-close', title:"Restore from Hold?",
	      buttons: { 
	      "Cancel": function() { 
	      	$(this).dialog("close"); 
	      },
	      "Restore": function() {
	      	editScene.newDocFromData(JSON.parse(data));
	      	$(this).dialog("close"); 
	      } },
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
		});
		editScene.disableCanvasInteractions(true);
	},

	/* export doc */
	saveDoc:function(){
		if(editScene.playing) editScene.stop();
		
		function refresh(e){
			//localStorage_setItem('save-compress', $('#save-compress').get(0).checked);
			//localStorage_setItem('save-raw', $('#save-raw').get(0).checked);
			
			var data = editScene.createDataObject(editScene.doc);
			
			data = JSON.stringify(data);
			//data = LZString.compressToBase64(data);
			
			$('#save-size').text(data.length + ' chars');
			$('#editor-save textarea').text(data);
		};

		
		var dlg = $('<div id="editor-save" class="editor">\
		<label for="save-name" class="pad5 w2">Name&nbsp;&nbsp;</label><input type="text" class="w4" id="save-name"/>\
		&nbsp;&nbsp;&nbsp;<button id="save-select">Select All</button>\
		<hr/>\
		<textarea readonly="readonly"></textarea>\
		<hr/>\
		<label for="save-compress" class="pad5">LZString - compress&nbsp;&nbsp;</label><input type="checkbox" id="save-compress"/>-->\
		<span id="save-size" class="flush-right">chars</span><br/>\
		<label for="save-raw" class="pad5">Raw (faster loading, bigger file)&nbsp;&nbsp;</label><input type="checkbox" id="save-raw"/>\
		<span class="info">Copy and paste above into a file</span>\
		</div>');
		
		$('#save-name', dlg).val(editScene.doc.name).change(refresh);
		$('#save-compress', dlg).change(refresh).get(0).checked = (localStorage_getItem('save-compress') == 'true');
		$('#save-raw', dlg).change(refresh).get(0).checked = (localStorage_getItem('save-raw') == 'true');
		$('#save-select', dlg).button().click(function(){ $('#editor-save textarea').get(0).select();});
		editScene.disableCanvasInteractions(true);
		
		dlg.dialog({
	      resizable: false, width: 400, height:470, modal: true, dialogClass:'no-close', title:"Export Data",
	      buttons: { OK: function() { $(this).dialog("close"); } },
	      open: refresh,
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
		});

	},

	/* export doc */
	loadDoc:function(){
		$('<div id="editor-load" class="editor">\
		<span class="info">Drag &amp; drop files below.</span>\
		<span class="info">Accepting .scene file to load scene, and .b64 files to load or replace PixelBox assets.</span>\
		<span class="info">This operation is not undo-able.</span>\
		<div id="drop-files"/>\
		</div>').dialog({
	      resizable: false, width: 400, height:400, modal: true, dialogClass:'no-close', title:"Import Scene",
	      buttons: { 
	      	"Import": function() {
	      	
	      		// unload assets first if loading a scene
	      		for(var i in editScene.toImport){
		      		if(editScene.toImport[i].name.indexOf('.scene') > 0){
			      		assets.unload();
			      		break;
		      		}
	      		}
	      	
	      		var reader = new FileReader();
	      		reader.onload = editScene.fileImported;
	      		reader.readAsText(editScene.toImport[0]);
		      	
		      	$(this).dialog("close"); 
	      	},
	      	"Cancel": function() { 
	      		$(this).dialog("close"); 
	      	},
	      },	      
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
		});
		
		editScene.disableCanvasInteractions(true);
	},

	/* new document */
	newDoc:function(e, createDefaults){
		if(e === true){
			this.doc = {
				name: "SCENE-NAME",
				assets: {}	
			};
			$('.object-label').remove();
			this.createContainer(createDefaults);
			this.initUndo();
			setTimeout(this.resetZoom.bind(this), 500);
		} else {
			if(!$('#new-doc').length){
				$('body').append('<div id="new-doc" class="center no-close">\
				Create new scene?\
				</div>');
			    $('#new-width,#new-height,#new-depth').spinner({min: 4, max: 256, step: 4 });
			}
	      	editScene.disableCanvasInteractions(true);
			$('#new-doc').dialog({
		      resizable: false, width: 250, height:360, modal: true, dialogClass:'no-close', title:"Create New",
		      buttons: {
		        "Create": function() {
		          assets.unload();
		          editScene.newDoc(true, true);
		          $(this).dialog("close");
		        },
		        Cancel: function() {
		          $(this).dialog("close");
		        }
		      },
		      close: function(){ 
		      	editScene.enableCanvasInteractions(true);
		      	$(this).remove();
		      }
		    });
	    }
	},

	/* imports frames from JSON'ed object */
	newDocFromData:function(dataObject){
	
		// init new document
		this.newDoc(true, false);
		
		// populate
		this.populateObject(this.container, dataObject.layers, { helpers: true, createCameras:true });
		THREE.PixelBox.updateLights(this.scene, true);
		
		// clear undo queue
		this.initUndo();
		this.resetZoom();
		
		// refresh
		editScene.refreshAssets();
		editScene.refreshScene();
	},
	
	createDataObject:function(options){
		var obj = {
			name:(options['name'] ? options['name'] : null),
			assets:(options['assets'] ? options['assets'] : {})
		};
		
		return obj;
	},
	
	onDragFilesOver:function(e){
		e.preventDefault();
		e.stopPropagation();
		if(e.type == 'dragover' && !$('#editor-load').length){
			editScene.toImport = [];
			editScene.loadDoc();
		}
	},
	
	onDropFiles:function(e){
		e.preventDefault();
		e.stopPropagation();
		console.log(e);
		var evt = e.originalEvent;
		var dt = evt.dataTransfer;
		if(dt){
			var added = $('#drop-files span.file');
			for(var i = 0; i < dt.files.length; i++){
				var nfd = dt.files[i];
				var ext = nfd.name.substr(nfd.name.lastIndexOf('.')+1);
				if(!nfd.size || (ext != 'b64' && ext != 'scene')) continue;
				
				// skip if already there
				var skip = false;
				for(var f = 0; f < added.length; f++){
					var fd = $(added[f]).data();
					if(fd && fd.name == nfd.name) {
						skip = true;
						break;
					}
				}
				if(skip) continue;
				// add
				var ax = $('<a>[X]</a>&nbsp;').click(function(){
					var name = $(this).parent().data().name;
					$(this).parent().remove();
					for(var i = 0; i < editScene.toImport.length; i++){ 
						if(editScene.toImport[i].name == name) { editScene.toImport.splice(i, 1); return; }
					}
				});
				var span = $('<span class="file"></span>').addClass(ext).text(nfd.name).data(nfd).prepend(ax);
				added.push(span[0]);
				// scene imported last
				if(ext == 'scene'){ // first
					editScene.toImport.push(nfd);
				// assets first
				} else {
					editScene.toImport.splice(0, 0, nfd);
				}
				$('#drop-files').append(span);
			}
			//console.log(dt);
		}
	},
	
	/* called for each dragged in imported file */
	fileImported:function(e){
		var data = e.target.result;
		
		editScene.toImport.splice(0, 1);
	   	
  		// parse
  		if(data.length) {
	  		var err = null;
	  		if(data.substr(0,1) != '{'){
	  			try {
	  				data = LZString.decompressFromBase64(data);
	  				if(!data) throw 1;
	  			} catch(e) {
	  				err = "Unable to LZString decompress string (File size: "+e.loaded+")";
	  			}
	  		}
	  		
	  		if(!err){
	  			try {
	  				data = JSON.parse(data);
	  			} catch(e){ err = "Unable to parse JSON (File size: "+e.loaded+")"; console.error(e); }
	  		}
	  		
	  		if(err){
	      		alert(err);
	      	} else {
		      	console.log(data);
		      	
		      	// asset
		      	if(data.width){
			     	// replace scene asset with updated one
			     	editScene.importSceneAsset(data);
			    // scene
		      	} else {
			   		editScene.newDocFromData(data);
		      	}	
	      	}
      	}	
      	
      	// next
      	if(editScene.toImport.length){
	   		var reader = new FileReader();
	   		reader.onload = editScene.fileImported;
	   		reader.readAsText(editScene.toImport[0]);
	   	}
	},
	
/* ------------------- ------------------- ------------------- ------------------- ------------------- Scene & asset functions */

	/* called to update placeholders, or to replace existing assets */
	importSceneAsset: function(newAsset){
		newAsset.importedAsset = _.deepClone(newAsset, 100);
     	THREE.PixelBox.prototype.processPixelBoxFrames(newAsset);
	
		var replaced = [];
		do {
			replaced.length = 0;
			var trav = function(obj3d){
				var newObj = null;
				// Replace placeholder with imported asset
				if(obj3d.isPlaceholder && obj3d.def.asset == newAsset.name){
					newObj = new THREE.PixelBox(newAsset);
					// transplant children
					for(var i = obj3d.children.length - 1; i >= 0; i--){
						var child = obj3d.children[i];
						obj3d.remove(child);
						// anchored child is added to new obj's anchor of same name
						if(child.anchored && newObj.anchors[child.anchored]){
							newObj.anchors[child.anchored].add(child);
						// transplant
						} else {
							newObj.add(child);
							child.anchored = false;
						}
						if(child.def && child.def.target && newObj.anchors[child.def.target]){
							child.target = newObj.anchors[child.def.target];
						}
					}
					
				// Replace existing asset
				} else if(obj3d instanceof THREE.PointCloud && obj3d.geometry.data != newAsset && obj3d.geometry.data.name == newAsset.name){
					newObj = new THREE.PixelBox(newAsset);
					// transplant children
					for(var i = obj3d.children.length - 1; i >= 0; i--){
						var child = obj3d.children[i];
						// transplant anchor's children to new anchor with same name
						if(child.isAnchor) {
							for(var j = child.children.length - 1; j >= 0; j--){
								var subchild = child.children[j];
								child.remove(subchild);
								// anchored subchild is added to new obj's anchor of same name
								if(newObj.anchors[child.name]){
									newObj.anchors[child.name].add(subchild);
								// no mathing anchor in new object, add as child
								} else {
									newObj.add(subchild);
									subchild.anchored = false;
								}
								// subchild had named target (anchor name)
								if(subchild.def.target && newObj.anchors[subchild.def.target]){
									subchild.target = newObj.anchors[subchild.def.target];
								}
								// update helper
								if(subchild.helper) subchild.helper.update(); 
							}
							// delete html
							if(child.htmlLabel) child.htmlLabel.remove();
							if(child.htmlRow) child.htmlRow.remove();
							child.htmlLabel = child.htmlRow = null;
							
						// regular, non-anchor child
						} else {
							obj3d.remove(child);
							// anchored child is added to new obj's anchor of same name
							if(child.anchored && newObj.anchors[child.anchored]){
								newObj.anchors[child.anchored].add(child);
							// transplant
							} else {
								newObj.add(child);
								child.anchored = false;
							}
							// update helper
							if(child.helper) child.helper.update();
						}						
					}
				}
				
				// populate new object
				if(newObj){
					newObj.anchored = obj3d.anchored;
					
					// update name
					if(obj3d.name){
						if(obj3d.anchored){
							obj3d.parent.parent[obj3d.name] = newObj;
						} else {
							obj3d.parent[obj3d.name] = newObj;
						}
					}
				
					// copy common props
					newObj.def = obj3d.def;
					newObj.name = obj3d.name;
					newObj.position.copy(obj3d.position);
					newObj.scale.copy(obj3d.scale);
					newObj.rotation.copy(obj3d.rotation);
					
					var layer = newObj.def;
					// copy pixelbox props from def
					if(layer.pointSize != undefined) { 
						newObj.pointSize = layer.pointSize;
					} else {
						var maxScale = Math.max(newObj.scale.x, newObj.scale.y, newObj.scale.z);
						newObj.pointSize = maxScale + 0.1;
					}
					if(layer.alpha != undefined) { 
						newObj.alpha = layer.alpha;
					}			
					if(layer.cullBack != undefined) newObj.cullBack = layer.cullBack;
					if(layer.occlusion != undefined) newObj.occlusion = layer.occlusion;
					if(layer.tint != undefined) { 
						if(layer.tint instanceof String) newObj.tint.set(parseInt(layer.tint, 16));
						else newObj.tint.copy(layer.tint);
					} else {
						newObj.tint.set(0xffffff);
					}
					if(layer.add != undefined) { 
						newObj.addColor.set(parseInt(layer.add, 16));
					} else {
						newObj.addColor.set(0x0);
					}					
					if(layer.stipple != undefined) { 
						newObj.stipple = layer.stipple;
					} else {
						newObj.stipple = 0;
					}
					if(layer.animSpeed != undefined) newObj.animSpeed = layer.animSpeed;
					if(layer.gotoAndStop != undefined){
						if(_.isArray(layer.gotoAndStop)){
							newObj.gotoAndStop(layer.gotoAndStop[0], layer.gotoAndStop[1]);
						} else if(typeof(layer.gotoAndStop) == 'string'){
							newObj.gotoAndStop(layer.gotoAndStop, 0);
						} else {
							newObj.frame = layer.gotoAndStop;
						}
					}
					if(layer.loopAnim != undefined) newObj.loopAnim(layer.loopAnim,Infinity,true);
					if(layer.loopFrom != undefined) { 
						newObj.gotoAndStop(layer.loopFrom[0], layer.loopFrom[1]); 
						newObj.loopAnim(layer.loopFrom[0],Infinity,true);
					}
					if(layer.playAnim != undefined) { 
						newObj.playAnim(layer.playAnim);
					}					
					
					// add to same parent
					replaced.push([obj3d, newObj]);
				}			
			};
			this.container.traverse(trav);
			
			// replace/reparent objects
			for(var i = 0; i < replaced.length; i++){ 
				var oldObj = replaced[i][0];
				var newObj = replaced[i][1];
				var p = oldObj.parent;
				// delete html
				if(oldObj.htmlLabel) oldObj.htmlLabel.remove();
				if(oldObj.htmlRow) oldObj.htmlRow.remove();
				oldObj.htmlLabel = oldObj.htmlRow = null;
				p.remove(oldObj);
				p.add(newObj);
			}
					
		} while(replaced.length);
		
		// dispose of old asset
		var oldAsset = assets.cache.get(newAsset.name);
		if(oldAsset){
			THREE.PixelBox.prototype.dispose(oldAsset);
		}
		// add new asset to cache
		assets.cache.add(newAsset.name, newAsset);
		
		// refresh
		editScene.refreshAssets();
		editScene.refreshScene();
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Scene panel & object picking */

	refreshScene:function(){
		var list = $('#scene-list');
		var templates = $('<div class="row" id="templates">Templates</div>');
		list.children().remove();
		
		// traverse
		editScene.container.traverse(function(obj3d){
			if(obj3d.isHelper || obj3d == editScene.container || obj3d.parent.isHelper) return;
			
			if(obj3d.htmlRow) obj3d.htmlRow.remove();
			var color = editScene.automaticColorForIndex(obj3d.id, 1.0);
			var type = obj3d.isAnchor ? 'Anchor' : (obj3d.def ? obj3d.def.asset : '?');
			obj3d.htmlRow = $('<div class="row" id="obj-'+obj3d.uuid+'"><div class="tiny-swatch" style="background-color:'+color+'"/><label/><span class="type">'+type+'</span></div>');
			obj3d.htmlRow.find('label').text(obj3d.name ? (obj3d.name.length ? obj3d.name : '(Object)') : '(Object)');

			var prow = list;
			if(obj3d.isTemplate){
				prow = templates;
			} else if(obj3d.parent != editScene.container){
				prow = $('#obj-'+obj3d.parent.uuid, list);
			}
		
			prow.append(obj3d.htmlRow);
		});
		
		if(list.children().length) { 
			list.append('<hr/><div style="height:4em;"/>');
		}
	},

	objectLabelClicked:function(e){
		console.log(e.target.id);
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Assets panel */

	
	assetEdit:function(e){
		var row = $(e.target).closest('.row');
		var origAsset = assets.cache.get(row.prop('asset'));
		if(!origAsset){
			alert("Asset "+row.prop('asset')+" hasn't been loaded.\nTODO: prompt to create new.");
			return;
		}
		var asset = _.deepClone(origAsset.importedAsset, 100);
		console.log("Editing ",asset);
		if(chrome && chrome.storage){
			chrome.app.window.create('editor/editor.html', { 
				id: asset.name,
				outerBounds: {
			      width: Math.max(800, window.outerWidth),
			      height: Math.max(600, window.outerHeight)
			    }
			 }, function(win){
			 	if(!win.contentWindow.loadAsset){
			 		win.contentWindow.loadAsset = asset;
			 		win.contentWindow.sceneEditor = editScene;
			 	}
			 	win.focus();
			});
		} else {
			var win = window.open('editor.html', '_blank');
		 	win.loadAsset = asset;
		 	win.sceneEditor = editScene;
		 	win.focus();
		}
	},

	refreshAssets:function(){
		var prevSelected = $('#asset-list div.selected').attr('id');
		$('#asset-list').children().remove();

		var rows = [];
		var allAssets = {};
		// reset use counts
		for(var key in assets.cache.files){
			assets.cache.files[key].used = 0;
		}
		// traverse and count
		editScene.container.traverse(function(obj3d){
			if(obj3d.isPlaceholder){	
				if(!allAssets[obj3d.def.asset]) allAssets[obj3d.def.asset] = { used: 1, name:obj3d.def.asset, missing:true };
				else allAssets[obj3d.def.asset].used++;
			} else if(obj3d instanceof THREE.PointCloud){
				assets.cache.files[obj3d.geometry.data.name].used++;
			}
		});
		_.extend(allAssets, assets.cache.files);
		// traverse scene to update use counts
		for(var i in allAssets){
			var asset = allAssets[i];
			var id = asset.name.replace(/\W|\s+/g,'-');
			var color = this.automaticColorForIndex(rows.length, 1.0);
			if(asset.missing) color = '#333';
			var newRow = $('<div class="row" id="asset-row-'+id+'"><div class="tiny-swatch" style="background-color:'+color+'"/><label/><span class="used">used '+asset.used+'</span></div>');
			newRow.find('label').text(asset.name);
			newRow.prop('asset', asset.name);
			if(asset.missing) newRow.addClass('missing');
			if(newRow.attr('id') == prevSelected) newRow.addClass('selected');
			newRow.click(this.assetSelect.bind(this));
			newRow.dblclick(this.assetEdit.bind(this));
			rows.push(newRow);
		}
		
		rows.sort(function(a,b){
			if(a.name < b.name) return -1;
			if(a.name > b.name) return 1;
			return 0;
		});	
		
		if(rows.length) rows.push($('<hr/><div style="height:4em;"/>'));
		
		$('#asset-list').append(rows);
		
		if(prevSelected) $('#'+prevSelected).trigger('click');
	},

	assetSelect:function(e){
		var row = $(e.target).closest('.row');
		$('#asset-list .row').removeClass('selected');
		
		if(row.length){
			row = row.get(0);
			$(row).addClass('selected');
		}
	},


/* ------------------- ------------------- ------------------- ------------------- ------------------- Undo functions */

	/* undo queue */
	initUndo:function(){
		this._undoing = false;
		this._undo = [];
		this._redo = [];
		this.undoChanged();
	},
	
	undoChanged:function(){
		$('#undo').button({label:"Undo" + (this._undo.length ? (' ('+this._undo.length+')') : ''), disabled: !this._undo.length});
		$('#redo').button({label:"Redo" + (this._redo.length ? (' ('+this._redo.length+')') : ''), disabled: !this._redo.length});
	},
	
	/* add undo item: { undo:[function, args . . .], redo:[function, args . . .] } */
	addUndo:function(item){
		if(this.playing) this.stop();
	
		if(!this._undoing){
			this._undo.push(item);
			this._redo.length = 0;
			this.undoChanged();
			
			// limit undo buffer size
			if(this._undo.length > 100){
				this._undo.splice(0, 1);
			}
		}	
	},
	performUndo:function(){
		if(this._undo.length){
			var item = this._undo.pop();
			this._redo.push(item);
			this._undoing = true;
			if(item instanceof Array){
				for(var i = item.length - 1; i >= 0; i--){
					var uitem = item[i];
					uitem.undo[0].apply(editScene, uitem.undo.slice(1));				
				}
			} else {
				item.undo[0].apply(editScene, item.undo.slice(1));
			}
			this._undoing = false;
			this.undoChanged();
			this.currentFrame = this._currentFrame;
		}
	},
	performRedo:function(){
		if(this._redo.length){
			var item = this._redo.pop();
			this._undo.push(item);
			this._undoing = true;
			if(item instanceof Array){
				for(var i = 0; i < item.length; i++){
					var uitem = item[i];
					uitem.redo[0].apply(editScene, uitem.redo.slice(1));				
				}
			} else {
				item.redo[0].apply(editScene, item.redo.slice(1));
			}
			this._undoing = false;
			this.undoChanged();
			this.currentFrame = this._currentFrame;
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- UI functions */

	/* create main editor UI*/
	addUI:function(){
		// menu bar
		$('body').append(
		'<div id="menu-bar" class="absolute-pos upper-left editor">\
		<ul class="horizontal"><li>\
		<a id="file">File</a></li><li><a id="edit">Edit</a></li><li><a id="view">View</a></li><li><a id="help">Help</a></li></ul>\
		</div>\
		<ul class="editor absolute-pos submenu shortcuts" id="file-submenu">\
			<li id="file-new">New Scene<em>Ctrl + N</em></li>\
			<hr/>\
			<li id="file-load">Import</li>\
			<li id="file-save">Export</li>\
			<hr/>\
			<li id="file-hold">Hold</li>\
			<li id="file-fetch">Fetch</li>\
			<hr/>\
			<li id="file-reset">Reset editor</li>\
		</ul>\
		<ul class="editor absolute-pos submenu shortcuts" id="edit-submenu">\
			<li id="edit-cut">Cut <em><span class="ctrl"/>X</em></li>\
			<li id="edit-copy">Copy <em><span class="ctrl"/>C</em></li>\
			<li id="edit-paste">Paste <em><span class="ctrl"/>V</em></li>\
			<hr/>\
			<li id="edit-delete">Delete selection <em>Delete</em></li>\
		</ul>\
		<ul class="editor absolute-pos submenu" id="view-submenu">\
			<li id="bg-color">Background color</li>\
			<hr/>\
			<li id="reset-zoom">Reset zoom</li>\
		</ul>\
		<div class="editor absolute-pos upper-right pad5">\
			<button id="redo">Redo</button>&nbsp;\
			<button id="undo">Undo</button>\
		</div>');
		
	// file menu
		$('#file').click(function(){
			$('.submenu').hide();
			var pos = $(this).offset();
			pos.top += $(this).height();
			$('#file-submenu').css(pos).show();
		});
		$('#file-new').click(editScene.newDoc.bind(editScene));
		$('#file-load').click(editScene.loadDoc);
		$('#file-save').click(editScene.saveDoc);
		$('#file-reset').click(editScene.resetLocalStorage);
		$('#file-hold').click(editScene.holdDoc);
		$('#file-fetch').click(editScene.fetchDoc);
		$('#file-submenu').menu().hide();

	// edit menu
		$('#edit').click(function(){
			$('.submenu').hide();
			var pos = $(this).offset();
			pos.top += $(this).height();
			$('#edit-submenu').css(pos).show();
		});
		$('#edit-submenu').menu().hide();
		//$('#edit-delete').click(editScene.fillBox.bind(editScene));
		//$('#edit-copy').click(editScene.copySelection.bind(editScene));
		//$('#edit-cut').click(editScene.cutSelection.bind(editScene));
		//$('#edit-paste').click(editScene.pasteSelection.bind(editScene));
		
		// view menu
		$('#view').click(function(){
			$('.submenu').hide();
			var pos = $(this).offset();
			pos.top += $(this).height();
			
			$('#view-submenu').css(pos).show();
			
			var c = new THREE.Color(editScene.clearColor);
			$('#bg-color').colpick({
				colorScheme:'dark',
				color: {r:c.r * 255, g:c.g * 255, b:c.b * 255},
				submit:0,
				onChange:function(hsb, hex, rgb){ 
					localStorage_setItem('editor-scene-bg-color', hex);
					editScene.clearColor = parseInt(hex,16);					
				},
			}).css({zIndex: 1000});
		});
		$('#reset-zoom').click(editScene.resetZoom.bind(editScene));
		$('#view-submenu').menu().hide();
		
	// help menu
		$('#help').click(editScene.showHelp);
	
	
	// properties
	$('body').append(
		'<div id="editor-props" class="ui-widget-header ui-corner-all editor floating-panel">\
		<h1>Properties</h1>\
		<hr/>\
		<div class="sub>\
		<label for="prop-name">Name</label><input type="text" size="10" id="prop-name"/>\
		</div>\
		</div>');
	
		var savePosOnDrop = function(e, ui) { localStorage_setItem(ui.helper.context.id + '-x', ui.position.left); localStorage_setItem(ui.helper.context.id + '-y', ui.position.top); };
		var bringToFront = function(e, ui){ $('body').append(ui.helper.context); }
		function makeDraggablePanel(id, defX, defY, onResizeHandler){
			var panel = $('#'+id);
			var dw = panel.width();
			var dh = panel.height();
			panel.resizable({
				containment:"body",
				minHeight:200,
				minWidth:parseInt(panel.css('min-width')),
				maxWidth:parseInt(panel.css('min-width')),
				stop: function(e, ui){
					var h = ui.size.height;
					localStorage_setItem(ui.helper.context.id + '-height', h);
				},
				resize: onResizeHandler
			});
			var coll = localStorage_getItem(id+'-collapsed'); 
			if(coll === 'true') { 
				panel.addClass('collapsed').resizable('disable');
			} else {
				var h = parseInt(localStorage_getItem(id+'-height'));
				panel.css('height', h ? h : (window.innerHeight * 0.25));
			}
			if(onResizeHandler) onResizeHandler();
			var dx = localStorage_getItem(id+'-x');
			var dy = localStorage_getItem(id+'-y');
			dx = Math.min((dx === null) ? defX : dx, window.innerWidth - dw);
			dy = Math.min((dy === null) ? defY : dy, window.innerHeight - dh);
			panel.offset({left:dx, top: dy}).draggable({ snap: ".editor", containment: "body", cancel: '.ui-widget,input,a,button', start: bringToFront, stop: savePosOnDrop });
		}
		
	// scene
		$('body').append(
		'<div id="editor-scene" class="ui-widget-header ui-corner-all editor floating-panel">\
		<h1>Scene</h1>\
		<hr/>\
		<button id="scene-add">Add Object</button><button id="scene-dupe">Dupe</button><!--<span class="separator-left"/>-->\
		<hr/>\
		<div id="scene-list"></div>\
		<hr/>\
		<button id="scene-delete">Delete</button>\
		</div>\
		<ul id="scene-add-menu" class="editor submenu absolute-pos">\
			<li id="scene-add-point-light">PixelBox asset</li><hr/>\
			<li id="scene-add-container">Object3D (Container)</li><hr/>\
			<li id="scene-add-point-light">Point Light</li>\
  		</ul>');
		$('#scene-add').button({icons:{secondary:'ui-icon-triangle-1-n'}}).click(function(){
		    $('#scene-add-menu').show().position({
	            at: "right top",
	            my: "right bottom",
	            of: this
	          });
          return false;
	    })
	    $('#scene-add-menu').hide().menu();
	    $('#scene-dupe').button();
	    $('#scene-delete').button();

	// assets
		$('body').append(
		'<div id="editor-assets" class="ui-widget-header ui-corner-all editor floating-panel">\
		<h1>Assets</h1>\
		<hr/>\
		<button id="asset-new">New</button><span class="separator-left"/>\
		<button id="asset-export">Export</button><!---->\
		<hr/>\
		<div id="asset-list"></div>\
		<hr/>\
		<button id="asset-delete">Delete</button>\
		</div>');
		$('#asset-new').button();
	    $('#asset-import').button();
	    $('#asset-export').button();
	    $('#asset-delete').button();
	    
	    makeDraggablePanel('editor-scene', 20, window.innerHeight * 0.25, function(){
	    	var h = $('#editor-scene').height();
	    	$('#scene-list').css('height', h - 140);
	    });
   		makeDraggablePanel('editor-props', window.innerWidth - $('#editor-props').width() - 20, window.innerHeight * 0.25, function(){
	    	var h = $('#editor-props').height();
	    	//$('#scene-list').height(h - 60);
	    });
	    makeDraggablePanel('editor-assets', window.innerWidth - $('#editor-assets').width() - 20, $('#editor-props').offset().top + $('#editor-props').height() + 20, function(){
    		var h = $('#editor-assets').height();
    		$('#asset-list').css('height', h - 140);
	    });

	// replace shortcut text
		$('.editor .ctrl').append(navigator.appVersion.indexOf("Mac")!=-1 ? '⌘ ':'Ctrl + ');
	
	// undo/redo
		$('#undo').button().click(this.performUndo.bind(this));
		$('#redo').button().click(this.performRedo.bind(this));
		
	// protect canvas when over UI
		$('.editor').hover(editScene.disableCanvasInteractions.bind(editScene),
							editScene.enableCanvasInteractions.bind(editScene));
		$("div").disableSelection();
		
	// add collapse buttons
		$('#editor-props,#editor-scene,#editor-assets').prepend('<a class="toggleCollapse">[-]</a>');
		$('.editor a.toggleCollapse').each(function(i, el){
			el = $(el);
			if(el.parent().hasClass('collapsed')) el.text('[+]'); 
		});
		$('.toggleCollapse').click(function(){
			var parent = $(this).parent();
			parent.toggleClass('collapsed');
			var collapsed = parent.hasClass('collapsed');
			$(this).text(collapsed ? '[+]' : '[-]');
			var dw = parent.width(), dh = parent.height();
			var pos = parent.offset();
			parent.offset({left:Math.min(pos.left, window.innerWidth - dw - 20),
							top: Math.min(pos.top, window.innerHeight - dh - 20)});
			var parentid = parent.get(0).id;
			if(collapsed){
				parent.resizable('disable');
				parent.css('height','');
			} else {
				parent.resizable('enable');
				parent.css('height', parseInt(localStorage_getItem(parentid+'-height')));
			}
			localStorage_setItem(parentid+'-collapsed', collapsed);
		});
		
	// focus/blur
		$('input').on('focus',function(e){editScene.focusedTextField = e.target; editScene.disableKeyboardShortcuts();})
				  .on('blur',function(e){editScene.focusedTextField = null; editScene.enableKeyboardShortcuts();})
				  .on('keyup',function(e){ if(e.which == 13) e.target.blur(); });
		
		//editScene.refreshScene();
		
		$(window).on('dragover', this.onDragFilesOver);
		$(window).on('dragleave', this.onDragFilesOver);
		$(window).on('drop', this.onDropFiles);
	},
	
	/* dispose of main UI */
	removeUI:function(){
		$('.editor').remove();
		$('body').off('mouseup.editor');
	},
	
	showHelp:function(){
		$('.submenu').hide();
		if(!$('#help-view').length){
			$('body').append('<div id="help-view" class="no-close">\
			<h2>Shortcuts</h2>\
			<em>Ctrl + N</em> create new<br/>\
			<em>Ctrl + S</em> hold<br/>\
			<em>Ctrl + E</em> export data<br/>\
			<br/>\
			<em><span class="ctrl"/>C</em> copy selection<br/>\
			<em><span class="ctrl"/>X</em> cut selection<br/>\
			<em><span class="ctrl"/>V</em> paste selection<br/>\
			</div>');
		}
		
		$('#help-view .ctrl').append(navigator.appVersion.indexOf("Mac")!=-1 ? '⌘ ':'Ctrl + ');
		
		editScene.disableCanvasInteractions(true);
		$('#help-view').dialog({
	      resizable: false, width: 500, height:500, modal: true, dialogClass:'no-close', title:"Help",
	      buttons: { OK: function() { $(this).dialog("close"); } },
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
	      });
	},
	
	// unfocus from text field or 
	blur:function(){
		if(editScene.focusedTextField) editScene.focusedTextField.blur();
		$('div,span').blur();
	},
	
	disableCanvasInteractions:function(all){
		if(this.stroking || this.controls.busy()) { 
			this.disableCanvasInteractionsOnRelease = true;
		} else {
			this.canvasInteractionsEnabled = false;
		}
		
		if(all === true){
			$(window).off('mouseup.editor mousedown.editor mousemove.editor');
			this.disableKeyboardShortcuts();
		}
	},
	
	enableCanvasInteractions:function(all){
		this.disableCanvasInteractionsOnRelease = false;
		this.canvasInteractionsEnabled = true;
		if(all === true){
			this.enableKeyboardShortcuts();
			$(window).on('keydown.editor', this.keyDown.bind(this));
			$(window).on('keyup.editor', this.keyUp.bind(this));
			$(window).on('mouseup.editor', this.mouseUp.bind(this));
			$(window).on('mousemove.editor', this.mouseMove.bind(this));
			$(window).on('mousedown.editor', this.mouseDown.bind(this));
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Keyboard functions */

	enableKeyboardShortcuts:function(){
		/*key('ctrl+n,⌘+n', function(){ editScene.newDoc(); return false; });
		key('ctrl+z,⌘+z', function(){ editScene.performUndo(); return false; });
		key('ctrl+shift+z,⌘+shift+z', function(){ editScene.performRedo(); return false; });
		key('ctrl+shift+c,⌘+shift+c', function(){ editScene.frameRangeCopy({}); return false; });
		key('ctrl+shift+v,⌘+shift+v', function(){ editScene.frameRangePaste({}); return false; });
		key('ctrl+shift+x,⌘+shift+x', function(){ editScene.frameRangeCut({}); return false; });
		key('ctrl+c,⌘+c', function(){ editScene.copySelection(); return false; });
		key('ctrl+v,⌘+v', function(){ editScene.pasteSelection(); return false; });
		key('ctrl+x,⌘+x', function(){ editScene.cutSelection(); return false; });
		key('escape', function(){ editScene.cancelPaste(); return false; });
		key('ctrl+s,⌘+s', function(){ editScene.holdDoc(); return false; });
		key('ctrl+e,⌘+e', function(){ editScene.saveDoc(); return false; });*/
	},

	disableKeyboardShortcuts:function(){
		/*key.unbind('ctrl+n,⌘+n');
		key.unbind('ctrl+z,⌘+z');
		key.unbind('ctrl+c,⌘+c');
		key.unbind('ctrl+x,⌘+x');
		key.unbind('ctrl+v,⌘+v');
		key.unbind('ctrl+shift+c,⌘+shift+c');
		key.unbind('ctrl+shift+x,⌘+shift+x');
		key.unbind('ctrl+shift+v,⌘+shift+v');
		key.unbind('escape');
		key.unbind('ctrl+shift+z,⌘+shift+z');
		key.unbind('ctrl+s,⌘+s');
		key.unbind('ctrl+e,⌘+e');*/
	},

	/* shortcuts */
	keyUp:function(e){
		if(editScene.focusedTextField || (e.target && (e.target.tagName == 'INPUT' || e.target.tagName == 'TEXTAREA'))) return;
	
		e.preventDefault();
		if($('.ui-dialog').length) return;

		switch(e.which){
		case 90: // Z
			if(e.shiftKey) editScene.performRedo();
			else editScene.performUndo();
			break;
		case 16:
			editScene.shift = false;
			break;
		case 17:
			editScene.ctrl = false;
			break;
		case 18:
			editScene.alt = false;
			break;
		}
	},
	
	keyDown:function(e){
		if(editScene.focusedTextField || (e.target && (e.target.tagName == 'INPUT' || e.target.tagName == 'TEXTAREA'))) return;
		
		e.preventDefault();
		
		if($('.ui-dialog').length && e.which != 13) return;
		
		switch(e.which){
		case 16:
			editScene.shift = true;
			break;
		case 17:
			editScene.ctrl = true;
			editScene.controls.rotateEnabled = !editScene.shift;
			break;
		case 18:
			editScene.alt = true;
			break;
		case 219:// [
			//editScene.maskPlaneStep(-1);
			break;
		case 221:// ]
			//editScene.maskPlaneStep(1);
			break;
		case 188:// <
			//editScene.currentFrame--;
			break;
		case 190:// >
			//editScene.currentFrame++;
			break;
		case 8: // del
		case 46: // back
			// editScene.fillBox(null, true);
			break;
		case 187: // +
			//editScene.maskInflate(null, 1);
			break;
		case 189:// -
			//editScene.maskInflate(null, -1);
			break;
		case 13: // enter
			var btn = $('.ui-dialog .ui-dialog-buttonset button').first();
			if(btn.length) btn.trigger('click');
			break;
		case 37: // left
			editScene.moveTool(-(e.shiftKey ? 5 : 1),0);
			break;
		case 39: // right
			editScene.moveTool((e.shiftKey ? 5 : 1),0);
			break;
		case 38: // up
			editScene.moveTool(0,(e.shiftKey ? 5 : 1));
			break;
		case 40: // down
			editScene.moveTool(0,-(e.shiftKey ? 5 : 1));
			break;
		case 32: // space
			break;
			
		default:
			console.log(e);
			break;
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Framework */

	/* initialize */
	init:function(){
		// defaults
		var bgc = localStorage_getItem('editor-scene-bg-color');
		this.clearColor = (bgc !== null ? parseInt(bgc,16) : 0x333333);	
		
		// setup scene
		this.scene = new THREE.Scene();
		this.scene.fog = new THREE.Fog(0x0, 100000, 1000000);
		
		// ambient
		/*var ambColor = localStorage_getItem('ambient-color');
		this.ambient = new THREE.AmbientLight(ambColor !== null ? parseInt(ambColor,16) : 0x202122);
		this.scene.add(this.ambient);

		// hemi
		var skyColor = localStorage_getItem('hemi-color');
		var groundColor = localStorage_getItem('hemi-ground-color');
		var intensity = localStorage_getItem('hemi-intensity');
		this.hemi = new THREE.HemisphereLight(
			skyColor !== null ? parseInt(skyColor, 16) : 0x4f8cb8,
			groundColor !== null ? parseInt(groundColor, 16) : 0x3d2410,
			intensity !== null ? parseFloat(intensity) : 0.1
		);
		this.scene.add(this.hemi);
		*/

		// camera
		this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 2000000 );
		this.camera.position.set(512, 512, 512);
		this.camera.lookAt(0,0,0);
		this.scene.add(this.camera);
		this.controls = new THREE.EditorControls(this.camera, document.body);//renderer.webgl.domElement);
	    this.controls.panEnabled = this.controls.rotateEnabled = this.controls.zoomEnabled = true;
	    
	    // sun
		/*pointColor = localStorage_getItem('direct-color');
		intensity = localStorage_getItem('direct-intensity');
		this.sun = new THREE.DirectionalLight(pointColor !== null ? parseInt(pointColor, 16) : 0xfff0ee, intensity !== null ? parseFloat(intensity) : 0.8);
		this.sun.shadowCameraVisible = false;
		this.sun.castShadow = true;//(localStorage_getItem('direct-shadow') !== 'false');
		this.sun.shadowDarkness = Math.min(1.0, this.sun.intensity * 0.5);
	    this.sun.shadowMapWidth = this.sun.shadowMapHeight = 2048;
	    this.sun.shadowCameraNear = 0;
		this.sun.shadowCameraFar = 2048;
	    this.sun.shadowCameraLeft = -128;
		this.sun.shadowCameraRight = 128;
		this.sun.shadowCameraTop = 128;
		this.sun.shadowCameraBottom = -128;
		this.sun.shadowBias = -0.0005;
	    this.scene.add(this.sun);
	    this.sunHelper = new THREE.DirectionalLightHelper(this.sun, 0.2);
	    this.sunHelper.frustumCulled = false;
	    this.sunHelper.visible = false;
	    this.scene.add(this.sunHelper);
		this.updateDirectLightPos();*/
	    
   		// projector & mouse picker
		this.projector = new THREE.Projector();
		this.raycaster = new THREE.Raycaster( new THREE.Vector3(), new THREE.Vector3(), 0.01, this.camera.far ) ;
		this.projectorPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);

		// create render target
		var renderTargetParameters = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat, stencilBuffer: false };
		this.fbo = new THREE.WebGLRenderTarget( window.innerWidth * renderer.scale,
												window.innerHeight * renderer.scale, renderTargetParameters );
					
		renderer.webgl.shadowMapEnabled = true;
		renderer.webgl.shadowMapSoft = true;
		renderer.webgl.shadowMapType = THREE.PCFSoftShadowMap;

		var data = localStorage_getItem('holdScene');
      	if(data){ 
      		this.newDocFromData(JSON.parse(data));
      	} else {
			this.newDoc(true);
		}
		
		this.resetZoom();
	},
	
	/* callbacks */
	onWillAdd:function(){
		$(window).on('resize.editScene',this.onResized.bind(this));
	},		
	onAdded:function(){
		this.addUI();
		$(window).on('keydown.editor', this.keyDown.bind(this));
		$(window).on('keyup.editor', this.keyUp.bind(this));
		$(window).on('mouseup.editor', this.mouseUp.bind(this));
		$(window).on('mousemove.editor', this.mouseMove.bind(this));
		$(window).on('mousedown.editor', this.mouseDown.bind(this));
      	
		editScene.enableKeyboardShortcuts();
	},
	onWillRemove:function(){ 
		this.removeUI();
		$(window).off('.editor');
		editScene.disableKeyboardShortcuts();
	},
	onRemoved:function(){
		this.controls.panEnabled = this.controls.rotateEnabled = this.controls.zoomEnabled = false;
		$(window).off('.editor');
	},
	
	render:function( delta, rtt ) {
		renderer.webgl.setClearColor( this.clearColor, 1 );
		if (rtt) renderer.webgl.render( this.scene, this.camera, this.fbo, true );
		else renderer.webgl.render( this.scene, this.camera );
		
		this.updateTextLabels(this.container, 0);
	},
	
	onResized: function(e){
		if($(e.target).hasClass('floating-panel')) return;
		
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		var renderTargetParameters = { 
			minFilter: THREE.LinearFilter, 
			magFilter: THREE.LinearFilter, 
			format: THREE.RGBFormat, 
			stencilBuffer: false };
		this.fbo = new THREE.WebGLRenderTarget( window.innerWidth * renderer.scale, window.innerHeight * renderer.scale, renderTargetParameters );
		
		localStorage_setItem('windowWidth',window.outerWidth);
		localStorage_setItem('windowHeight',window.outerHeight);
    },
};

var editScene = new EditSceneScene();

/* helper */
function fake0(v){ if(Math.abs(v) < 0.01) return 0; else return v; }
function not0(v){ if(Math.abs(v) < 0.01 || isNaN(v)) return 0.001; else return v; }
function notNaN(v){ if(isNaN(v)) return 0; else return v; }


/* called on document load */
function documentReady(){
	// init renderer
	if(!renderer.init()){
		var err = "Your browser doesn't support WebGL";
		alert(err);
		console.error(err);
		return;
	} else {
		console.log("WebGL initialized");
	}
	
	// init localstorage, then start
	localStorage_init(function(){
		editScene.init();
		renderer.setScene(editScene);
	});
}

/* global helper functions */
function localStorage_init(onReady) {
	if(chrome && chrome.storage){
		chrome.storage.local.get(null, function(obj){
			window.storageShadow = obj;
			onReady();
		});
	} else onReady();
}

function localStorage_setItem(key, val){
	if(chrome && chrome.storage){
		var kv = {};
		window.storageShadow[key] = kv[key] = val.toString();
		chrome.storage.local.set(kv);
	} else {
		localStorage.setItem(key, val);
	}
}

function localStorage_getItem(key){
	if(chrome && chrome.storage){
		return (window.storageShadow[key] !== undefined) ? window.storageShadow[key] : null;
	} else {
		return localStorage.getItem(key);
	}
	return null;
}

function localStorage_clear(){
	if(chrome && chrome.storage){
		chrome.storage.local.clear();
		window.storageShadow = {};
	} else {
		localStorage.clear();
	}
}

/* cookies */
function createCookie(name, value, days) {
    var expires;

    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toGMTString();
    } else {
        expires = "";
    }
    document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + expires + "; path=/";
}

function readCookie(name) {
    var nameEQ = encodeURIComponent(name) + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name, "", -1);
}

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

$(document).ready(documentReady);
