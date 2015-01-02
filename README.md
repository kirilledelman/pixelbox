# PixelBox

PixelBox is an extension for [three.js](http://threejs.org), for rendering voxel sprites.

It includes base classes, a sprite and scene editor, and some examples.

PixelBox was originally developed to create [Santa Drop game for iOS](https://itunes.apple.com/us/app/santa-drop-free/id948393987), and then expanded with extra tools and released as open source.

## Links

* [PixelBox Wiki](https://github.com/kirilledelman/pixelbox/wiki/PixelBox)
* [Example 1: Single scene](http://gogoat.com/pixelbox/example1.html)
* [Example 2: Transitions and composer](http://gogoat.com/pixelbox/example2.html)
* [Example 3: Animations and tweens](http://gogoat.com/pixelbox/example3.html)
* [Example 4: Instancing templates and object recycling](http://gogoat.com/pixelbox/example4.html)
* [Example 5: Animation events](http://gogoat.com/pixelbox/example5.html)
* [Example 6: Snow](http://gogoat.com/pixelbox/example6.html)
* [Scene Editor / Sprite Editor](PixelBox Scene Editor) - works best with Google Chrome.

## PixelBox sprites
* Based on THREE.PointCloud.
* Multiple named animations, that can be played or looped at variable speed, forward or backward.
* Named anchors that are animated along with sprite's frames. They can be used, for example, to specify where the character's hand is during different animations. Other objects can be added to anchors, which serve as simple containers.
* Ability to tween any property, such as opacity, position, or color.
* Support transparent and self-illuminated voxels.
* Cast and receive shadows.
* Sprite opacity, tint, and additive color.
* Sprite stipple (pattern transparency).
* Animation and anchor events.

## PixelBoxScene class
* Parses / populates scenes created with PixelBox scene editor.
* Supports instancing of templates created with scene editor.
* Object recycling: instead of destroying objects, they get recycled for quicker reuse.
* Receives notifications when switching scenes from PixelBoxRenderer class.

## PixelBoxAssets class
* Easy preloading of assets - PixelBox scenes, sprites, image textures, and json files.
* Load progress and complete notifications.

## PixelBoxRenderer class
* Used to switch between PixelBox scenes, with or without transitions.
* Scene transitions using textures or blends are adopted from three.js examples.
* Built-in downsampling of resolution rendering.
