module.exports = function(grunt) {

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        concat: {
        	dist: {
		        src: [
		            'src/*.js'
		        ],
		        dest: 'js/pixelbox.js',
		    }
        },
        
        uglify: {
		    build: {
		        src: 'js/pixelbox.js',
		        dest: 'js/pixelbox.min.js'
		    }
		}

    });

    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.registerTask('default', ['concat','uglify']);

};
