(function () {
	'use strict';

	var _ = require('lodash');
	var MovementAi = require('./ai/movement');
	var ShootAi = require('./ai/shooting');
	var Doors = require('./world/Doors');
	var DOOR_DIRECTIONS = Doors.DOOR_DIRECTIONS;

	var TILE_SIZE = 50,
		WALL_SIZE = TILE_SIZE * 1.6,
		TILES_X = 15,
		TILES_Y = 9,
		GRID_START = WALL_SIZE + TILE_SIZE / 2,
		ROOM_X = TILES_X * TILE_SIZE + 2 * WALL_SIZE,
		ROOM_Y = TILES_Y * TILE_SIZE + 2 * WALL_SIZE,
		roomOffsetX, roomOffsetY;

	var LevelGenerator = require('./world/LevelGenerator');
	var levelGenerator = new LevelGenerator();

	var roomsMask = [
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
	];

	var game = new Phaser.Game(ROOM_X, ROOM_Y, Phaser.AUTO, '', {
		preload: preload,
		create: create,
		update: update,
		render: render
	});

	var collisionGroups = {
		playerCollisionGroup: {},
		enemiesCollisionGroup: {},
		bulletsCollisionGroup: {},
		stonesCollisionGroup: {},
		doorCollisionGroup: {}
	};

	var player,
		enemies,
		enemyAis = [],
		doors,
		stones,
		cursors,
		levelGrid,
		keys = {}, // Those are keyboard buttons. I thought it stands for key item to open doors, lol
//		Bullet = require('./bullet/Bullet.js'),
		bullets,
		fireRate = 2,
		fireDelay = 1000,
		fireDisabled = false,
		doorsHelper;

	var wall_top,
		wall_bottom,
		wall_left,
		wall_right,
		wall_corner_top_left,
		wall_corner_top_right,
		wall_corner_bottom_left,
		wall_corner_bottom_right;

	function preload() {

		game.load.image('wallCorner', 'assets/sprites/wall_corner_1.png');
		game.load.image('wallPattern', 'assets/sprites/wall_pattern_1.png');
		game.load.image('player', 'assets/sprites/isaac.png');
		game.load.image('enemy', 'assets/sprites/enemy.png');
		game.load.image('bullet', 'assets/sprites/bullet-red.png');
		game.load.image('stone', 'assets/sprites/stone_1.png');
		game.load.image('crate', 'assets/sprites/crate_1.png');

	}

	function create() {

		createLevelGrid();

		//basic game settings
		game.stage.backgroundColor = '#0E74AF';
		game.scale.fullScreenScaleMode = Phaser.ScaleManager.SHOW_ALL;
		game.world.setBounds(0, 0, ROOM_X * roomsMask[0].length, ROOM_Y * roomsMask.length);
		game.physics.startSystem(Phaser.Physics.P2JS);
		game.physics.p2.setImpactEvents(true);

		//collision groups
		collisionGroups.playerCollisionGroup = game.physics.p2.createCollisionGroup();
		collisionGroups.enemiesCollisionGroup = game.physics.p2.createCollisionGroup();
		collisionGroups.bulletsCollisionGroup = game.physics.p2.createCollisionGroup();
		collisionGroups.stonesCollisionGroup = game.physics.p2.createCollisionGroup();
		collisionGroups.doorCollisionGroup = game.physics.p2.createCollisionGroup();
		collisionGroups.wallsCollisionGroup = game.physics.p2.createCollisionGroup();

		// game.world.setBounds(0, 0, ROOM_X, ROOM_Y);

		window.game = game;

		game.physics.p2.updateBoundsCollisionGroup();

		cursors = game.input.keyboard.createCursorKeys();

		keys['w'] = game.input.keyboard.addKey(Phaser.Keyboard.W);
		keys['a'] = game.input.keyboard.addKey(Phaser.Keyboard.A);
		keys['s'] = game.input.keyboard.addKey(Phaser.Keyboard.S);
		keys['d'] = game.input.keyboard.addKey(Phaser.Keyboard.D);
		keys['f'] = game.input.keyboard.addKey(Phaser.Keyboard.F);

		_.each(keys, function (key) {
			key.onDown.add(function () {

				//fullscreen toggle
				if (key.keyCode === Phaser.Keyboard.F) {
					toggleFullscreen();
				}
			});

			key.onHoldCallback = function () {
				//direction fire
				if (key.keyCode === Phaser.Keyboard.A) {
					playerFire('left');
				} else if (key.keyCode === Phaser.Keyboard.D) {
					playerFire('right');
				} else if (key.keyCode === Phaser.Keyboard.W) {
					playerFire('top');
				} else if (key.keyCode === Phaser.Keyboard.S) {
					playerFire('bottom');
				}
			};
		});

		// Should those be created by function?
		bullets = game.add.group();
		bullets.enableBody = true;
		bullets.physicsBodyType = Phaser.Physics.P2JS;

		enemies = game.add.group();
		enemies.enableBody = true;
		enemies.physicsBodyType = Phaser.Physics.P2JS;

		stones = game.add.group();
		stones.enableBody = true;
		stones.physicsBodyType = Phaser.Physics.P2JS;

		doors = game.add.group();
		doors.enableBody = true;
		doors.physicsBodyType = Phaser.Physics.P2JS;

		doorsHelper = new Doors(game, TILES_X, TILES_Y);

		createWorld(roomsMask, createRoom);

		game.camera.focusOnXY(player.x, player.y);

	}

	function createWall(wallTileSprite) {
		wallTileSprite.enableBody = true;
		wallTileSprite.physicsBodyType = Phaser.Physics.P2JS;
		game.physics.p2.enable(wallTileSprite);
		wallTileSprite.body.setCollisionGroup(collisionGroups.wallsCollisionGroup);
		wallTileSprite.body.fixedRotation = true;
		wallTileSprite.body.static = true;
		wallTileSprite.body.collides(_.values(collisionGroups));
	}


	function createWorld(roomMask, roomConstructor) {
		if (!_.isArray(roomMask)) {
			return;
		}

		_.forIn(roomMask, function (row, y) {
			_.forIn(row, function (item, x) {
				if (!item) {
					return;
				}
				roomConstructor(x * ROOM_X, y * ROOM_Y);
			});
		});
	}

	function createRoom(x, y, orientation) {
		var enemiesMask = levelGenerator.newMask({
			x: TILES_X,
			y: TILES_Y,
			enemies: {
				count: 4
			}
		});
		var stoneMask = levelGenerator.newMask({
			x: TILES_X,
			y: TILES_Y,
			enemies: {
				count: 6
			}
		});

		roomOffsetX = x;
		roomOffsetY = y;

		game.add.text(x, y, _.uniqueId('_room'));

		createWalls();

		//creating player
		createPlayer();
		createLevel(stoneMask, stones, createStone);
		createLevel(enemiesMask, enemies, createEnemy);
		createRoomDoors(doors);
	}

	function createWalls() {
		// wall corners
		wall_corner_top_left = game.add.sprite(roomOffsetX, roomOffsetY, 'wallCorner');
		wall_corner_top_right = game.add.sprite(roomOffsetX + ROOM_X, roomOffsetY, 'wallCorner');
		wall_corner_bottom_left = game.add.sprite(roomOffsetX, roomOffsetY + ROOM_Y, 'wallCorner');
		wall_corner_bottom_right = game.add.sprite(roomOffsetX + ROOM_X, roomOffsetY + ROOM_Y, 'wallCorner');

		// corners flipping
		wall_corner_top_right.scale.x = -1;
		wall_corner_bottom_left.scale.y = -1;
		wall_corner_bottom_right.angle = 180;

		var roomCenterX = roomOffsetX + ROOM_X / 2,
			roomCenterY = roomOffsetY + ROOM_Y / 2,
			addSprite  = game.add.tileSprite.bind(game.add);

		// walls
		wall_top = addSprite(roomCenterX, roomOffsetY + WALL_SIZE / 2, TILES_X * TILE_SIZE, WALL_SIZE, 'wallPattern');
		wall_left = addSprite(roomOffsetX + WALL_SIZE / 2, roomCenterY, TILES_Y * TILE_SIZE, WALL_SIZE, 'wallPattern');
		wall_bottom = addSprite(roomCenterX, roomOffsetY + ROOM_Y - WALL_SIZE / 2, TILES_X * TILE_SIZE, WALL_SIZE, 'wallPattern');
		wall_right = addSprite(roomOffsetX + ROOM_X - WALL_SIZE / 2, roomCenterY, TILES_Y * TILE_SIZE, WALL_SIZE, 'wallPattern');

		// wall rotation
		wall_left.angle = -90;
		wall_right.angle = 90;
		wall_bottom.angle = 180;

		// wall creation
		createWall(wall_top);
		createWall(wall_left);
		createWall(wall_bottom);
		createWall(wall_right);
	}

	function createRoomDoors(group) {
		var options = {
			spriteName: 'crate',
			collisionGroup: collisionGroups.doorCollisionGroup,
			collisionGroups: collisionGroups
		};
		doorsHelper.createDoor(_.extend({
			group: group,
			direction: DOOR_DIRECTIONS.LEFT,
			position: getSpriteCoordinates(doorsHelper.getDoorPosition(DOOR_DIRECTIONS.LEFT))
		}, options));
		doorsHelper.createDoor(_.extend({
			group: group,
			direction: DOOR_DIRECTIONS.RIGHT,
			position: getSpriteCoordinates(doorsHelper.getDoorPosition(DOOR_DIRECTIONS.RIGHT))
		}, options));
		doorsHelper.createDoor(_.extend({
			group: group,
			direction: DOOR_DIRECTIONS.TOP,
			position: getSpriteCoordinates(doorsHelper.getDoorPosition(DOOR_DIRECTIONS.TOP))
		}, options));
		doorsHelper.createDoor(_.extend({
			group: group,
			direction: DOOR_DIRECTIONS.BOTTOM,
			position: getSpriteCoordinates(doorsHelper.getDoorPosition(DOOR_DIRECTIONS.BOTTOM))
		}, options));
	}

	var createPlayer = _.once(function () {
		player = game.add.sprite(roomOffsetX + ROOM_X / 2, roomOffsetY + ROOM_Y / 2, 'player'); // should be added to group and spawned on grid
		player.anchor.setTo(0.5, 0.5);
		game.physics.p2.enable(player);
		player.body.setCollisionGroup(collisionGroups.playerCollisionGroup);
		player.body.collides(_.values(_.omit(collisionGroups, 'playerCollisionGroup')));
		player.body.fixedRotation = true;

		player.events.onOutOfBounds.add(function () {
			game.camera.follow(player);
		});

		game.camera.follow(player);
	});


	function playerFire(direction) {

		if (!fireDisabled) {
			fireDisabled = true;

			var bullet,
				bulletPosition = _.clone(player.position),
				bulletVelocity = {
					x: player.body.velocity.x,
					y: player.body.velocity.y
				};

			switch (direction) {
				case ('left'):
					bulletPosition.x -= 30;
					bulletVelocity.x += -300;
					player.body.velocity.x += 200;
					break;
				case ('right'):
					bulletPosition.x += 30;
					bulletVelocity.x += 300;
					player.body.velocity.x += -200;
					break;
				case ('top'):
					bulletPosition.y -= 30;
					bulletVelocity.y += -300;
					player.body.velocity.y += 200;
					break;
				case ('bottom'):
					bulletPosition.y += 30;
					bulletVelocity.y += 300;
					player.body.velocity.y += -200;
					break;
				default:
					console.log('No playerFire direction');
					break;
			}

			bullet = bullets.create(bulletPosition.x, bulletPosition.y, 'bullet');
			bullet.body.velocity.x = bulletVelocity.x;
			bullet.body.velocity.y = bulletVelocity.y;
			bullet.body.setCircle(10);
			bullet.body.setCollisionGroup(collisionGroups.bulletsCollisionGroup);
			bullet.body.collides([collisionGroups.enemiesCollisionGroup], function (bul, en) {
				if (bul.sprite.alive && en.sprite.alive) {
					bul.sprite.kill();
					en.sprite.kill();
				}
				console.log('collision')
			}, this);

			bullet.body.collides([collisionGroups.stonesCollisionGroup, collisionGroups.doorCollisionGroup, collisionGroups.wallsCollisionGroup], function (bul) {
				if (bul.sprite.alive) {
					bul.sprite.kill();
				}
			});

			var fireRateTimeout = setTimeout(function () {
				fireDisabled = false;
			}, fireDelay / fireRate);
		}
	}

	function toggleFullscreen() {
		if (game.scale.isFullScreen) {
			game.scale.stopFullScreen();
		} else {
			game.scale.startFullScreen(false); // false = retain pixel art, true = smooth art
		}
	}

	function update() {
		if (cursors.left.isDown) {
			player.body.velocity.x += -5;
		} else if (cursors.right.isDown) {
			player.body.velocity.x += 5;
		}

		if (cursors.up.isDown) {
			player.body.velocity.y += -5;
		} else if (cursors.down.isDown) {
			player.body.velocity.y += 5;
		}
		_.each(enemyAis, function (ai) {
			if (ai.move) {
				ai.move();
			}
			if (ai.shoot) {
				ai.shoot();
			}
		});
	}

	function createLevel(mask, group, constructor) {
		if (!_.isArray(mask)) {
			return;
		}

		_.forIn(mask, function (row, y) {
			_.forIn(row, function (value, x) {
				if (!value) {
					return;
				}
				constructor(group, x, y, value);
			});
		});
	}

	function createStone(group, column, row) {
		var stone = createAtPoint(group, column, row, 'stone');
		stone.body.setCollisionGroup(collisionGroups.stonesCollisionGroup);
		stone.body.collides(_.values(_.omit(collisionGroups, 'stonesCollisionGroup')));
		stone.body.fixedRotation = true;
		stone.body.static = true;
	}

	function createEnemy(group, column, row) {
		var enemy = createAtPoint(group, column, row, 'enemy');
		enemy._id = _.uniqueId('enemy_');
		enemy.body.fixedRotation = true;
		enemy.body.setCollisionGroup(collisionGroups.enemiesCollisionGroup);
		enemy.body.collides(_.values(collisionGroups));
		enemyAis.push(new ShootAi({
			object: enemy,
			target: player,
			bulletsGroup: bullets,
			bulletCollisionGroup: collisionGroups.bulletsCollisionGroup,
			targetCollisionGroup: _.values(_.omit(collisionGroups, 'bulletcollisionGroup', 'enemiesCollisionGroup')),
			difficulty: 1
		}));
		// enemyAis.push(new MovementAi(enemy, player, 500));
	}

	function createLevelGrid() {
		levelGrid = [];
		for (var i = 0; i < TILES_X; i++) {
			levelGrid[i] = [];
			for (var j = 0; j < TILES_Y; j++) {
				levelGrid[i][j] = [GRID_START + i * TILE_SIZE, GRID_START + j * TILE_SIZE];
			}
		}
	}

	function getSpriteCoordinates(column, row) {
		if (column instanceof Object) {
			row = column.y;
			column = column.x;
		}
		return {
			x: levelGrid[column][row][0] + roomOffsetX,
			y: levelGrid[column][row][1] + roomOffsetY
		};
	}

	function createAtPoint(group, column, row, sprite) {
		var coords = getSpriteCoordinates(column, row);
		return group.create(coords.x, coords.y, sprite);
	}

	function render() {
		game.debug.cameraInfo(game.camera, 32, 32);
		game.debug.spriteCoords(player, 32, 475);
	}
})();