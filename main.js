import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Chess } from 'chess.js';

console.log("main.js: Script started.");

class ChessGame {
    constructor() {
        console.log("ChessGame: Constructor initialized.");
        this.boardSize = 8;
        this.squareSize = 2;
        this.pieces = [];
        this.selectedPiece = null;
        this.possibleMoves = [];
        this.moveSpheres = [];
        this.moveHistory = [];
        this.capturedByWhite = [];
        this.capturedByBlack = [];

        // TEXTURE LOADING
        this.textureLoader = new THREE.TextureLoader();
        this.woodTexture = this.textureLoader.load('https://threejs.org/examples/textures/hardwood2_diffuse.jpg');
        this.woodTexture.colorSpace = THREE.SRGBColorSpace;
        this.woodTexture.wrapS = THREE.RepeatWrapping;
        this.woodTexture.wrapT = THREE.RepeatWrapping;
        this.woodTexture.repeat.set(4, 4);

        this.colors = {
            white: 0xffffff,
            black: 0x222222,
            whiteSquare: 0xfafafa,
            blackSquare: 0x242426,
            highlight: 0xd4af37,
            validMove: 0x00ff00
        };

        // Material for pieces
        this.materials = {
            w: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.3, metalness: 0.1 }),
            b: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.1 })
        };
        
        this.models = {};

        // We defer initialization to an async method
        this.init();
    }

    async init() {
        try {
            console.log("ChessGame: Initializing scene first...");
            this.initScene();

            console.log("ChessGame: Setting up lights...");
            this.setupLights();

            console.log("ChessGame: Creating board...");
            this.createBoard();

            console.log("ChessGame: Initializing chess logic...");
            this.initChess();
            
            console.log("ChessGame: Loading models...");
            await this.loadModels();

            console.log("ChessGame: Setting up pieces...");
            this.setupPieces();

            console.log("ChessGame: Setting up event listeners...");
            this.setupEventListeners();

            console.log("ChessGame: Starting animation loop...");
            this.animate();

            console.log("ChessGame: SUCCESS - Initialization complete.");
        } catch (error) {
            console.error("ChessGame: FATAL ERROR during initialization:", error);
        }
    }

    async loadModels() {
        const loader = new GLTFLoader();
        const types = {
            'p': 'assets/Pawn/Pawn.glb',
            'r': 'assets/Rook/Rook.glb',
            'n': 'assets/Knight/Knight.glb',
            'b': 'assets/Bishop/Bishop.glb',
            'q': 'assets/Queen/Queen.glb',
            'k': 'assets/King/King.glb'
        };

        const loadModel = (url) => new Promise((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
        });

        for (const [type, url] of Object.entries(types)) {
            try {
                const gltf = await loadModel(url);
                const model = gltf.scene;
                // Center model if needed
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());

                // Set origin to bottom center
                model.position.y -= box.min.y;
                
                // Scale model to fit square Size (1 square = 2 units)
                const maxDim = Math.max(size.x, size.z);
                const scale = (this.squareSize * 0.8) / maxDim;
                model.scale.set(scale, scale, scale);
                
                // Add shadows
                model.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                this.models[type] = model;
                console.log(`Loaded ${type} model`);
            } catch (e) {
                console.error(`Failed to load model ${type} from ${url}`, e);
            }
        }
    }

    initChess() {
        try {
            this.chess = new Chess();
            this.turnIndicator = document.getElementById('turn-indicator');
            this.moveList = document.getElementById('move-list');
            this.capturedWhiteEl = document.getElementById('captured-white');
            this.capturedBlackEl = document.getElementById('captured-black');
            console.log("initChess: Logic initialized.");
        } catch (e) {
            console.error("initChess: Failed!", e);
            throw e;
        }
    }

    initScene() {
        this.container = document.getElementById('game-canvas-container');
        if (!this.container) throw new Error("Container #game-canvas-container not found.");

        const rect = this.container.getBoundingClientRect();
        let width = rect.width || this.container.clientWidth || (window.innerWidth - 350);
        let height = rect.height || this.container.clientHeight || (window.innerHeight - 150);

        if (width < 20) width = window.innerWidth - 350;
        if (height < 20) height = window.innerHeight - 150;

        console.log(`initScene: Renderer size set to ${width}x${height}`);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0d);
        this.scene.fog = new THREE.Fog(0x0a0a0d, 20, 100);

        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this.camera.position.set(0, 18, 22);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        // Ensure canvas is visible
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.maxPolarAngle = Math.PI / 2.1;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 50;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this._resizeObserver = new ResizeObserver(() => this.onWindowResize());
        this._resizeObserver.observe(this.container);
    }

    setupLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xfff5e0, 2.5);
        sun.position.set(12, 25, 12);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.left = -20;
        sun.shadow.camera.right = 20;
        sun.shadow.camera.top = 20;
        sun.shadow.camera.bottom = -20;
        this.scene.add(sun);

        const fill = new THREE.DirectionalLight(0xc0d8ff, 0.5);
        fill.position.set(-10, 15, -10);
        this.scene.add(fill);
    }

    createBoard() {
        const boardGroup = new THREE.Group();
        const baseGeo = new THREE.BoxGeometry(18, 0.8, 18);
        const baseMat = new THREE.MeshStandardMaterial({ 
            map: this.woodTexture,
            color: 0x5a3a22,
            roughness: 0.8 
        });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = -0.65;
        boardGroup.add(base);

        const squareGeo = new THREE.BoxGeometry(this.squareSize, 0.5, this.squareSize);

        for (let x = 0; x < 8; x++) {
            for (let z = 0; z < 8; z++) {
                const isLight = (x + z) % 2 === 0;
                const material = new THREE.MeshStandardMaterial({
                    map: this.woodTexture,
                    color: isLight ? 0xe8c39e : 0x6e4325,
                    roughness: 0.6,
                    metalness: 0.1
                });

                const square = new THREE.Mesh(squareGeo, material);
                square.position.set((x - 3.5) * this.squareSize, 0, (z - 3.5) * this.squareSize);
                square.receiveShadow = true;
                square.userData = { type: 'square', x, z };
                boardGroup.add(square);
            }
        }
        this.scene.add(boardGroup);
    }

    setupPieces() {
        if (!this.chess) return;
        const boardState = this.chess.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = boardState[r][c];
                if (piece) {
                    this.createPiece(piece.type, piece.color, r, c);
                }
            }
        }
    }

    createPiece(type, color, row, col) {
        if (!this.models[type]) return;
        
        // Clone the model
        const model = SkeletonUtils.clone(this.models[type]);
        
        // Apply materials
        model.traverse(child => {
            if (child.isMesh) {
                child.material = this.materials[color].clone();
            }
        });

        const x = (col - 3.5) * this.squareSize;
        const z = (row - 3.5) * this.squareSize;
        
        const boardY = 0.25; // Board square height / 2
        model.position.set(x, boardY, z);
        
        // Rotate knights and other pieces to face correct direction
        if (color === 'b') {
            model.rotation.y = Math.PI;
        }

        // We wrap the model in a group so raycasting easily catches it
        const group = new THREE.Group();
        group.add(model);
        group.position.set(x, boardY, z);
        model.position.set(0,0,0);
        
        group.userData = { type: 'piece', color, pType: type, row, col };
        
        // Add user data to meshes too so raytracing hits them properly
        model.traverse(child => {
            if (child.isMesh) {
                child.userData = group.userData;
            }
        });

        this.scene.add(group);
        this.pieces.push({ mesh: group, color, type, row, col });
    }

    setupEventListeners() {
        window.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.getElementById('reset-btn').addEventListener('click', () => this.resetGame());
        document.getElementById('modal-reset-btn').addEventListener('click', () => {
            document.getElementById('game-modal').classList.add('hidden');
            this.resetGame();
        });
    }

    onWindowResize() {
        if (!this.container || !this.renderer) return;
        const rect = this.container.getBoundingClientRect();
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(rect.width, rect.height);
    }

    onMouseDown(event) {
        const bounds = this.renderer.domElement.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;

        this.mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        this.mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        if (intersects.length > 0) this.handleInteraction(intersects[0].object);
        else this.deselect();
    }

    handleInteraction(object) {
        const ud = object.userData;
        if (ud.type === 'move') { this.makeMove(this.selectedPiece.userData, { x: ud.x, z: ud.z }); return; }
        if (ud.type === 'piece') {
            if (ud.color === this.chess.turn()) this.selectPiece(object);
            else if (this.selectedPiece) this.makeMove(this.selectedPiece.userData, { x: ud.col, z: ud.row });
        } else if (ud.type === 'square' && this.selectedPiece) {
            this.makeMove(this.selectedPiece.userData, { x: ud.x, z: ud.z });
        } else { this.deselect(); }
    }

    selectPiece(mesh) {
        this.deselect();
        // Since we hit a mesh, get the top level group which has the actual piece logic
        this.selectedPiece = mesh.parent && mesh.parent.userData.type === 'piece' ? mesh.parent : mesh;
        
        // highlight
        this.selectedPiece.traverse(child => {
            if (child.isMesh && child.material.emissive) {
                child.material.emissive.setHex(0x335533);
            }
        });
        
        const alg = this.coordsToAlgebraic(this.selectedPiece.userData.row, this.selectedPiece.userData.col);
        this.possibleMoves = this.chess.moves({ square: alg, verbose: true });
        this.showPossibleMoves();
    }

    deselect() {
        if (this.selectedPiece) {
            this.selectedPiece.traverse(child => {
                if (child.isMesh && child.material.emissive) {
                    child.material.emissive.setHex(0x000000);
                }
            });
        }
        this.selectedPiece = null;
        this.clearMoveSpheres();
    }

    showPossibleMoves() {
        const geo = new THREE.SphereGeometry(0.25, 12, 12);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6 });
        this.possibleMoves.forEach(move => {
            const c = this.algebraicToCoords(move.to);
            const s = new THREE.Mesh(geo, mat);
            s.position.set((c.col - 3.5) * this.squareSize, 0.6, (c.row - 3.5) * this.squareSize);
            s.userData = { type: 'move', x: c.col, z: c.row };
            this.scene.add(s);
            this.moveSpheres.push(s);
        });
    }

    clearMoveSpheres() { this.moveSpheres.forEach(s => this.scene.remove(s)); this.moveSpheres = []; }

    makeMove(from, to) {
        const move = this.chess.move({ from: this.coordsToAlgebraic(from.row, from.col), to: this.coordsToAlgebraic(to.z, to.x), promotion: 'q' });
        if (move) {
            if (move.captured) {
                if (move.color === 'w') this.capturedByWhite.push({ type: move.captured });
                else this.capturedByBlack.push({ type: move.captured });
            }
            this.updateBoard();
            this.updateUI(move);
            this.checkGameOver();
        }
        this.deselect();
    }

    updateBoard() {
        this.pieces.forEach(p => this.scene.remove(p.mesh));
        this.pieces = [];
        this.setupPieces();
    }

    updateUI(move) {
        const turn = this.chess.turn() === 'w' ? 'WHITE' : 'BLACK';
        if (this.turnIndicator) {
            this.turnIndicator.innerText = `${turn}'S TURN`;
            this.turnIndicator.className = this.chess.turn() === 'w' ? 'white-turn' : 'black-turn';
        }
        if (this.moveHistory && move) {
            const history = this.chess.history();
            this.moveList.innerHTML = history.map((m, i) => i % 2 === 0 ? `<div class="move-entry"><span class="move-num">${(i / 2 + 1)}.</span><span>${m}</span>` : `<span>${m}</span></div>`).join('');
            this.moveList.scrollTop = this.moveList.scrollHeight;
        }
        this.renderCaptured();
    }

    renderCaptured() {
        const syms = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };
        if (this.capturedWhiteEl) this.capturedWhiteEl.innerHTML = this.capturedByWhite.map(p => `<span>${syms[p.type]}</span>`).join('');
        if (this.capturedBlackEl) this.capturedBlackEl.innerHTML = this.capturedByBlack.map(p => `<span>${syms[p.type]}</span>`).join('');
    }

    checkGameOver() {
        if (this.chess.isCheckmate() || this.chess.isDraw()) {
            const modal = document.getElementById('game-modal');
            const title = document.getElementById('modal-title');
            const body = document.getElementById('modal-body');
            title.textContent = this.chess.isCheckmate() ? 'Checkmate!' : 'Draw!';
            body.textContent = this.chess.isCheckmate() ? `${this.chess.turn() === 'w' ? 'Black' : 'White'} wins!` : 'Game is a draw.';
            modal.classList.remove('hidden');
        }
    }

    resetGame() {
        this.chess.reset();
        this.capturedByWhite = [];
        this.capturedByBlack = [];
        this.updateBoard();
        this.updateUI(null);
        this.deselect();
    }

    coordsToAlgebraic(r, c) { return String.fromCharCode(97 + c) + (8 - r); }
    algebraicToCoords(a) { return { col: a.charCodeAt(0) - 97, row: 8 - parseInt(a[1]) }; }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => {
    console.log("window.onload: Starting game initialization...");
    try {
        const game = new ChessGame();
        console.log("window.onload: Game instance created.");
    } catch (e) {
        console.error("window.onload: Failed to create game!", e);
    }
});