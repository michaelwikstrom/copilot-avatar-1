import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const ROOT_AGENT_ID = 'root';
const ROOT_SCALE = 1;
const SUBAGENT_SCALE = 0.38;
const MESSAGE_FADE_MS = 6000;
const IDLE_SLEEP_MS = 5 * 60 * 1000;
const EMOTION_HOLD_MS = 9000;
const THINKING_HOLD_MS = 1800;
const INTENT_HOLD_MS = 2600;
const COMPLETION_HOLD_MS = 2000;
const FAILURE_HOLD_MS = 1100;
const ACTIVITY_COLORS = {
    idle: new THREE.Color(0xffffff),
    writing: new THREE.Color(0x3fb950),
    reading: new THREE.Color(0x58a6ff),
    running: new THREE.Color(0xd29922),
    thinking: new THREE.Color(0xbc8cff),
    success: new THREE.Color(0x7ee787),
    failed: new THREE.Color(0xff7b72),
};
const ACTIVITY_BADGES = {
    idle: { icon: '•', text: 'Idle' },
    writing: { icon: '{ }', text: 'Writing code' },
    reading: { icon: '👁', text: 'Reading code' },
    running: { icon: '>_', text: 'Running commands' },
    thinking: { icon: '🧠', text: 'Thinking' },
    success: { icon: '✓', text: 'Completed' },
    failed: { icon: '⚠', text: 'Failed' },
};
const PARTICLE_COLORS = [0x3fb950, 0x58a6ff, 0xbc8cff, 0xd29922, 0xffffff];
const PARTY_EMOJIS = ['🎉', '🥳', '🎊'];
const THINK_EMOJIS = ['🤔', '💭'];
const SUCCESS_EMOJIS = ['✅', '✔️', '✔', '☑️', '👍', '🙌'];
const WARNING_EMOJIS = ['⚠️', '⚠', '🚨'];
const ERROR_EMOJIS = ['❌', '✖️', '✖', '🐛'];
const SPARKLE_EMOJIS = ['✨', '🌟', '💫'];
const HEART_EMOJIS = ['❤️', '❤', '💖', '💗', '💓', '💕', '💞', '💘', '💝', '😍', '🥰'];
const LAUGH_EMOJIS = ['😂', '🤣', '😆', '😹'];
const RACCOON_EMOJIS = ['🦝'];
const SLEEP_EMOJIS = ['😴', '💤'];

const container = document.getElementById('avatar-container');
const overlayContainer = document.getElementById('subagent-overlays');
const messageEl = document.getElementById('message-text');
const statusEl = document.getElementById('status-indicator');
const subtasksEl = document.getElementById('subtasks');
const emotionBubbleEl = document.getElementById('emotion-bubble');

const ttsToggleBtn = document.getElementById('tts-toggle');
const ttsSettingsBtn = document.getElementById('tts-settings-btn');
const ttsDropdown = document.getElementById('tts-dropdown');
const ttsEngineSelect = document.getElementById('tts-engine-select');
const ttsWebspeechSection = document.getElementById('tts-webspeech-section');
const ttsVoxtralSection = document.getElementById('tts-voxtral-section');
const ttsVoiceSelect = document.getElementById('tts-voice-select');
const ttsRateInput = document.getElementById('tts-rate-input');
const ttsRateValue = document.getElementById('tts-rate-value');
const ttsPitchInput = document.getElementById('tts-pitch-input');
const ttsPitchValue = document.getElementById('tts-pitch-value');
const ttsPitchRow = document.getElementById('tts-pitch-row');
const voxtralUrlInput = document.getElementById('voxtral-url-input');
const voxtralApikeyInput = document.getElementById('voxtral-apikey-input');
const voxtralRefreshBtn = document.getElementById('voxtral-refresh-btn');
const voxtralCloudSection = document.getElementById('voxtral-cloud-section');
const voxtralLocalSection = document.getElementById('voxtral-local-section');
const voxtralVoiceSelect = document.getElementById('voxtral-voice-select');
const voxtralPresetSection = document.getElementById('voxtral-preset-section');
const voxtralRecordSection = document.getElementById('voxtral-record-section');
const voxtralRecordBtn = document.getElementById('voxtral-record-btn');
const voxtralRecordTimer = document.getElementById('voxtral-record-timer');
const voxtralStopBtn = document.getElementById('voxtral-stop-btn');
const voxtralAudioPreview = document.getElementById('voxtral-audio-preview');
const voxtralRerecordBtn = document.getElementById('voxtral-rerecord-btn');

const avatars = new Map();
const pendingSubagents = [];
const particles = [];

let rootWorking = false;
let rootLastActivityAt = performance.now();
let rootEmotion = { name: 'default', until: 0 };
let fadeTimeout = null;
let animationStarted = false;
let lastFrameTime = performance.now();
let baseAsset = null;
let layoutState = {
    columns: 1,
    rows: 0,
    slotWidthPx: 180,
    overlayScale: 1,
    rootScale: ROOT_SCALE,
    rootY: 0.55,
    subScale: SUBAGENT_SCALE,
    spacingX: 0.9,
    rowGap: 0.42,
    stackCenterY: -0.8,
    cameraDistance: 3.2,
    cameraLookAtY: 0.05,
    cameraY: 0.05,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);

const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.65);
keyLight.position.set(3.5, 5.5, 4.5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x7f8cff, 0.42);
fillLight.position.set(-3, 2.2, -1.8);
scene.add(fillLight);
scene.add(new THREE.HemisphereLight(0x9966ff, 0x1c2230, 0.68));

const eyeVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const eyeFragmentShader = `
  uniform float uTime;
  uniform float uBlink;
  uniform float uMode;
  uniform vec3 uColor;
  varying vec2 vUv;

  float capsuleMask(vec2 uv) {
    float capsule = length(max(abs(uv) - vec2(0.2, 0.45), 0.0)) - 0.35;
    return 1.0 - smoothstep(-0.05, 0.02, capsule);
  }

  float laughMask(vec2 uv) {
    float curve = abs(uv.y + 0.16 + 0.28 * cos(uv.x * 2.6));
    float band = 1.0 - smoothstep(0.02, 0.08, curve);
    float width = 1.0 - smoothstep(0.42, 0.78, abs(uv.x));
    return band * width;
  }

  float sleepMask(vec2 uv) {
    float curve = abs(uv.y + 0.02 * sin(uv.x * 8.0));
    float band = 1.0 - smoothstep(0.018, 0.055, curve);
    float width = 1.0 - smoothstep(0.35, 0.82, abs(uv.x));
    return band * width;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    float mode = floor(uMode + 0.5);
    float mask = capsuleMask(uv);
    float alpha = mask;
    float scanline = sin(vUv.y * 40.0 + uTime * 2.0) * 0.5 + 0.5;
    scanline = smoothstep(0.3, 0.7, scanline);
    float brightness = 0.7 + scanline * 0.3;

    if (mode > 0.5 && mode < 1.5) {
      mask = laughMask(uv);
      alpha = mask;
      brightness = 0.95;
    } else if (mode >= 1.5) {
      mask = sleepMask(uv);
      alpha = mask;
      brightness = 0.85;
    } else {
      float blinkMask = smoothstep(1.0 - uBlink, 1.0 - uBlink + 0.05, 1.0 - abs(uv.y));
      alpha = mask * blinkMask;
    }

    vec3 color = uColor * brightness;
    color += uColor * pow(max(alpha, 0.0), 0.75) * 0.28;
    gl_FragColor = vec4(color, alpha);
  }
`;

const eyeGeometry = new THREE.PlaneGeometry(0.12, 0.18);
const maskGeometry = new THREE.PlaneGeometry(1, 1);
const particleTexture = createParticleTexture();
const readingBeamTexture = createReadingBeamTexture();
const heartGeometry = createHeartGeometry();
const binaryGlyphTextures = {
    0: createBinaryGlyphTexture('0'),
    1: createBinaryGlyphTexture('1'),
};
const overlayVector = new THREE.Vector3();
const worldVector = new THREE.Vector3();
const rightEyeVector = new THREE.Vector3();
const confettiOriginVector = new THREE.Vector3();

function createParticleTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}

function createReadingBeamTexture() {
    const width = 96;
    const height = 384;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(88,166,255,0)');
    gradient.addColorStop(0.32, 'rgba(88,166,255,0.08)');
    gradient.addColorStop(0.5, 'rgba(180,224,255,0.78)');
    gradient.addColorStop(0.68, 'rgba(88,166,255,0.08)');
    gradient.addColorStop(1, 'rgba(88,166,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function createBinaryGlyphTexture(character) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.font = '700 88px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(63, 185, 80, 0.55)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#d2f8da';
    ctx.fillText(character, size / 2, size / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function createHeartGeometry() {
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0.5, 0.5);
    heartShape.bezierCurveTo(0.5, 0.5, 0.4, 0.0, 0.0, 0.0);
    heartShape.bezierCurveTo(-0.6, 0.0, -0.6, 0.7, -0.6, 0.7);
    heartShape.bezierCurveTo(-0.6, 1.1, -0.3, 1.54, 0.5, 1.9);
    heartShape.bezierCurveTo(1.2, 1.54, 1.6, 1.1, 1.6, 0.7);
    heartShape.bezierCurveTo(1.6, 0.7, 1.6, 0.0, 1.0, 0.0);
    heartShape.bezierCurveTo(0.7, 0.0, 0.5, 0.5, 0.5, 0.5);

    const geometry = new THREE.ShapeGeometry(heartShape, 24);
    geometry.center();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const maxDim = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
    geometry.scale(1 / maxDim, 1 / maxDim, 1);
    return geometry;
}

function createEyeMaterial() {
    return new THREE.ShaderMaterial({
        vertexShader: eyeVertexShader,
        fragmentShader: eyeFragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
            uTime: { value: 0 },
            uBlink: { value: 1 },
            uMode: { value: 0 },
            uColor: { value: new THREE.Color(0xffffff) },
        },
    });
}

function createHeartEye() {
    const glow = new THREE.Mesh(heartGeometry, new THREE.MeshBasicMaterial({
        color: 0xff5ca8,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
    }));
    const core = new THREE.Mesh(heartGeometry, new THREE.MeshBasicMaterial({
        color: 0xff8fc7,
        depthWrite: false,
        side: THREE.DoubleSide,
    }));

    glow.scale.setScalar(1.22);
    glow.position.z = -0.001;
    glow.renderOrder = 3;
    core.position.z = 0.001;
    core.renderOrder = 4;

    const heart = new THREE.Group();
    heart.visible = false;
    heart.add(glow, core);
    heart.userData.glow = glow;
    heart.userData.core = core;
    return heart;
}

function placeHeartEye(heartEye, x, y, z, scale = 0.1) {
    heartEye.position.set(x, y, z + 0.003);
    heartEye.userData.baseScale = scale;
    heartEye.scale.setScalar(scale);
}

function createActivityEffects() {
    const readingBeamMaterial = new THREE.MeshBasicMaterial({
        map: readingBeamTexture,
        color: 0x7fc8ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
    });
    const readingBeam = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1), readingBeamMaterial);
    readingBeam.visible = false;
    readingBeam.renderOrder = 3;

    const thinkingDots = Array.from({ length: 3 }, (_, index) => {
        const material = new THREE.SpriteMaterial({
            map: particleTexture,
            color: 0xbc8cff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(material);
        sprite.visible = false;
        sprite.renderOrder = 4;
        return {
            sprite,
            material,
            phase: (index / 3) * Math.PI * 2,
            orbitRadius: 0.11 + index * 0.02,
            size: 1 - index * 0.12,
        };
    });

    return { readingBeam, readingBeamMaterial, thinkingDots };
}

function createWritingGlyphs() {
    return Array.from({ length: 6 }, (_, index) => {
        const character = index % 2 === 0 ? '1' : '0';
        const material = new THREE.SpriteMaterial({
            map: binaryGlyphTextures[character],
            color: 0x7ee787,
            transparent: true,
            opacity: 0,
            depthWrite: false,
        });
        const sprite = new THREE.Sprite(material);
        sprite.visible = false;
        sprite.renderOrder = 5;
        sprite.center.set(0.5, 0.5);
        return {
            sprite,
            material,
            orbitRadius: 0.12 + index * 0.032,
            verticalOffset: 0.22 + index * 0.036,
            phase: (index / 6) * Math.PI * 2,
            speed: 0.9 + index * 0.12,
            drift: index % 2 === 0 ? 1 : -1,
            size: 0.085 + (index % 3) * 0.014,
        };
    });
}

function containsAny(text, emojis) {
    return emojis.some((emoji) => text.includes(emoji));
}

function detectEmotion(text) {
    if (!text) return null;
    if (containsAny(text, PARTY_EMOJIS)) return 'party';
    if (containsAny(text, HEART_EMOJIS)) return 'heart';
    if (containsAny(text, LAUGH_EMOJIS)) return 'laugh';
    if (containsAny(text, SUCCESS_EMOJIS)) return 'success';
    if (containsAny(text, WARNING_EMOJIS)) return 'warning';
    if (containsAny(text, ERROR_EMOJIS)) return 'error';
    if (containsAny(text, THINK_EMOJIS)) return 'think';
    if (containsAny(text, SPARKLE_EMOJIS)) return 'sparkle';
    if (containsAny(text, RACCOON_EMOJIS)) return 'raccoon';
    if (containsAny(text, SLEEP_EMOJIS)) return 'sleep';
    return null;
}

function classifyTool(toolName) {
    if (!toolName) return 'idle';
    if (toolName === 'edit' || toolName === 'create') return 'writing';
    if (toolName === 'view' || toolName === 'grep' || toolName === 'glob' || toolName === 'rg' || toolName.startsWith('lsp')) return 'reading';
    if (toolName === 'powershell' || toolName === 'task') return 'running';
    return 'idle';
}

function registerRootActivity() {
    rootLastActivityAt = performance.now();
}

function setRootEmotion(name, durationMs = EMOTION_HOLD_MS) {
    rootEmotion = {
        name,
        until: performance.now() + durationMs,
    };
}

function getActiveRootEmotion(now = performance.now()) {
    if (rootEmotion.until > now) return rootEmotion.name;
    if (!rootWorking && now - rootLastActivityAt >= IDLE_SLEEP_MS) return 'sleep';
    return 'default';
}

function updateEmotionBubble(emotion) {
    const text = ({
        party: '🎉',
        heart: '❤',
        laugh: '😂',
        think: '🤔',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        sparkle: '✨',
        raccoon: '🦝',
        sleep: 'zzz',
    })[emotion] || '';

    emotionBubbleEl.textContent = text;
    emotionBubbleEl.className = text ? `visible ${emotion}` : '';
}

function updateStatusIndicator() {
    if (rootWorking) {
        statusEl.textContent = '● Working…';
        statusEl.classList.add('active');
        return;
    }

    statusEl.textContent = '';
    statusEl.classList.remove('active');
}

function updateTtsButton() {
    ttsToggleBtn.textContent = ttsEnabled ? '🔊' : '🔇';
}

function createBaseAsset(modelScene) {
    if (!modelScene) {
        return {
            sourceScene: null,
            size: new THREE.Vector3(1, 1, 1),
            maxDim: 1,
            eyeY: 0,
            eyeZ: 0.5,
            eyeSpacing: 0.15,
            heartScale: 0.1,
            overlayOffset: new THREE.Vector3(0, -0.35, 0.3),
            bubbleOffset: new THREE.Vector3(0.2, 0.16, 0.45),
            readingBeamY: 0,
            readingBeamZ: 0.56,
            readingBeamHeight: 0.78,
            readingBeamWidth: 0.18,
            thinkingCenterY: 0.34,
            thinkingOrbitRadius: 0.12,
            thinkingDotSize: 0.05,
            rowSpacing: 0.9,
            rootY: 0.55,
            subY: -0.8,
        };
    }

    const centeredScene = SkeletonUtils.clone(modelScene);
    const box = new THREE.Box3().setFromObject(centeredScene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    centeredScene.position.sub(center);

    return {
        sourceScene: centeredScene,
        size,
        maxDim: Math.max(size.x, size.y, size.z),
        eyeY: size.y * 0.28,
        eyeZ: size.z * 0.39,
        eyeSpacing: size.x * 0.11,
        heartScale: 0.1,
        overlayOffset: new THREE.Vector3(0, -size.y * 0.82, size.z * 0.14),
        bubbleOffset: new THREE.Vector3(size.x * 0.18, size.y * 0.36, size.z * 0.42),
        readingBeamY: size.y * 0.2,
        readingBeamZ: size.z * 0.5,
        readingBeamHeight: size.y * 0.8,
        readingBeamWidth: Math.max(size.x * 0.18, 0.12),
        thinkingCenterY: size.y * 0.54,
        thinkingOrbitRadius: Math.max(size.x * 0.19, 0.11),
        thinkingDotSize: Math.max(size.x * 0.07, 0.045),
        rowSpacing: Math.max(size.x * 0.78, 0.72),
        rootY: size.y * 0.6,
        subY: -size.y * 0.9,
    };
}

function createOverlay(agentId) {
    const labelEl = document.createElement('div');
    labelEl.className = 'subagent-label';
    labelEl.dataset.agentId = agentId;

    const nameEl = document.createElement('span');
    nameEl.className = 'agent-name';

    const badgeEl = document.createElement('span');
    badgeEl.className = 'agent-badge idle';

    const badgeIconEl = document.createElement('span');
    badgeIconEl.className = 'agent-badge-icon';

    const badgeTextEl = document.createElement('span');
    badgeTextEl.className = 'agent-badge-text';

    badgeEl.append(badgeIconEl, badgeTextEl);
    labelEl.append(nameEl, badgeEl);
    overlayContainer.appendChild(labelEl);

    return { labelEl, nameEl, badgeEl, badgeIconEl, badgeTextEl };
}

function defaultDisplayName(agentId) {
    if (!agentId) return 'Agent';
    return agentId.length > 12 ? `agent-${agentId.slice(0, 6)}` : agentId;
}

function createAvatarInstance(agentId, data = {}) {
    const isRoot = agentId === ROOT_AGENT_ID;
    const group = new THREE.Group();
    const modelRoot = baseAsset.sourceScene ? SkeletonUtils.clone(baseAsset.sourceScene) : new THREE.Group();
    group.add(modelRoot);

    const eyeMatL = createEyeMaterial();
    const eyeMatR = createEyeMaterial();
    const eyeL = new THREE.Mesh(eyeGeometry, eyeMatL);
    const eyeR = new THREE.Mesh(eyeGeometry, eyeMatR);
    eyeL.renderOrder = 2;
    eyeR.renderOrder = 2;

    const heartEyeL = createHeartEye();
    const heartEyeR = createHeartEye();
    heartEyeL.rotation.z = Math.PI - 0.16;
    heartEyeR.rotation.z = Math.PI + 0.16;

    const raccoonMask = new THREE.Mesh(maskGeometry, new THREE.MeshBasicMaterial({
        color: 0x05070c,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
    }));
    raccoonMask.visible = false;
    raccoonMask.renderOrder = 1;

    raccoonMask.scale.set(baseAsset.size.x * 0.44, baseAsset.size.y * 0.13, 1);
    raccoonMask.position.set(0, baseAsset.eyeY, baseAsset.eyeZ - 0.01);
    eyeL.position.set(-baseAsset.eyeSpacing, baseAsset.eyeY, baseAsset.eyeZ);
    eyeR.position.set(baseAsset.eyeSpacing, baseAsset.eyeY, baseAsset.eyeZ);
    placeHeartEye(heartEyeL, -baseAsset.eyeSpacing * 0.98, baseAsset.eyeY, baseAsset.eyeZ, baseAsset.heartScale);
    placeHeartEye(heartEyeR, baseAsset.eyeSpacing * 0.98, baseAsset.eyeY, baseAsset.eyeZ, baseAsset.heartScale);
    modelRoot.add(raccoonMask, eyeL, eyeR, heartEyeL, heartEyeR);
    const writingGlyphs = createWritingGlyphs();
    for (const glyph of writingGlyphs) {
        modelRoot.add(glyph.sprite);
    }
    const activityEffects = createActivityEffects();
    activityEffects.readingBeam.position.set(0, baseAsset.readingBeamY, baseAsset.readingBeamZ);
    activityEffects.readingBeam.scale.set(baseAsset.readingBeamWidth, baseAsset.readingBeamHeight, 1);
    modelRoot.add(activityEffects.readingBeam);
    for (const dot of activityEffects.thinkingDots) {
        modelRoot.add(dot.sprite);
    }

    const overlay = isRoot ? null : createOverlay(agentId);
    const targetPosition = new THREE.Vector3(0, isRoot ? baseAsset.rootY : baseAsset.subY, 0);
    const currentPosition = targetPosition.clone();
    const baseScale = isRoot ? ROOT_SCALE : SUBAGENT_SCALE;
    const currentEyeColor = ACTIVITY_COLORS.idle.clone();

    const avatar = {
        agentId,
        agentName: data.agentName || '',
        displayName: data.displayName || defaultDisplayName(agentId),
        description: data.description || '',
        isRoot,
        group,
        modelRoot,
        eyeL,
        eyeR,
        eyeMatL,
        eyeMatR,
        heartEyeL,
        heartEyeR,
        raccoonMask,
        writingGlyphs,
        activityEffects,
        overlay,
        activeTools: new Map(),
        thinkingUntil: 0,
        intentText: '',
        intentUntil: 0,
        expressionName: 'default',
        expressionUntil: 0,
        effectState: 'idle',
        leaveAt: 0,
        leaving: false,
        inLayout: !isRoot,
        createdAt: performance.now(),
        targetPosition,
        currentPosition,
        baseScale,
        currentScale: isRoot ? baseScale : 0.01,
        targetPresence: 1,
        presence: isRoot ? 1 : 0.01,
        scalePulseUntil: 0,
        flashUntil: 0,
        shakeUntil: 0,
        happyBlinkUntil: 0,
        currentEyeColor,
        currentEyeMode: 0,
        currentEyeScaleX: 1,
        currentEyeScaleY: 1,
        currentHeartPulse: 1,
        currentMaskOpacity: 0,
        currentBobY: 0,
        currentRotX: 0,
        currentRotY: 0,
        currentRotZ: 0,
        currentWritingFx: 0,
        currentReadingFx: 0,
        currentThinkingFx: 0,
        anim: {
            idleTime: 0,
            blinkTimer: 2 + Math.random() * 3,
            winkTimer: 8 + Math.random() * 10,
            isBlinking: false,
            isWinking: false,
            blinkProgress: 0,
            blinkPhase: 0,
            targetRotX: 0,
            targetRotY: 0,
            wanderTimer: 0,
        },
    };

    scene.add(group);
    avatars.set(agentId, avatar);
    updateAvatarMetadata(avatar, data);
    updateAvatarBadge(avatar);
    return avatar;
}

function disposeAvatar(avatar) {
    scene.remove(avatar.group);

    avatar.eyeMatL.dispose();
    avatar.eyeMatR.dispose();
    avatar.raccoonMask.material.dispose();
    avatar.heartEyeL.userData.glow.material.dispose();
    avatar.heartEyeL.userData.core.material.dispose();
    avatar.heartEyeR.userData.glow.material.dispose();
    avatar.heartEyeR.userData.core.material.dispose();
    for (const glyph of avatar.writingGlyphs) {
        glyph.material.dispose();
    }
    avatar.activityEffects.readingBeam.geometry.dispose();
    avatar.activityEffects.readingBeamMaterial.dispose();
    for (const dot of avatar.activityEffects.thinkingDots) {
        dot.material.dispose();
    }

    if (avatar.overlay) {
        avatar.overlay.labelEl.remove();
    }
}

function updateAvatarMetadata(avatar, data = {}) {
    if (data.agentName) avatar.agentName = data.agentName;
    if (data.displayName) avatar.displayName = data.displayName;
    if (data.description) avatar.description = data.description;

    if (!avatar.displayName) {
        avatar.displayName = defaultDisplayName(avatar.agentId);
    }

    if (avatar.overlay) {
        avatar.overlay.nameEl.textContent = avatar.displayName;
    }
}

function consumePendingSubagent(payload = {}) {
    if (!pendingSubagents.length) return payload;

    const index = payload.toolCallId
        ? pendingSubagents.findIndex((item) => item.toolCallId && item.toolCallId === payload.toolCallId)
        : 0;
    const pending = index >= 0 ? pendingSubagents.splice(index, 1)[0] : pendingSubagents.shift();
    return { ...pending, ...payload };
}

function ensureAvatar(agentId, payload = {}) {
    const resolvedId = agentId || ROOT_AGENT_ID;
    if (avatars.has(resolvedId)) {
        const avatar = avatars.get(resolvedId);
        updateAvatarMetadata(avatar, payload);
        return avatar;
    }

    const data = resolvedId === ROOT_AGENT_ID ? payload : consumePendingSubagent(payload);
    const avatar = createAvatarInstance(resolvedId, data);
    if (!avatar.isRoot) {
        layoutSubagents();
    }
    return avatar;
}

function computeLayoutState(subagentCount) {
    const width = Math.max(container.clientWidth || 0, 320);
    const height = Math.max(container.clientHeight || 0, 360);
    const maxColumns = Math.max(1, Math.floor((width - 32) / 168));
    const columns = subagentCount > 0 ? Math.min(subagentCount, maxColumns) : 1;
    const rows = subagentCount > 0 ? Math.ceil(subagentCount / columns) : 0;
    const slotWidthPx = subagentCount > 0 ? Math.max(118, (width - 32) / columns) : width - 32;
    const widthScale = THREE.MathUtils.clamp(slotWidthPx / 190, 0.66, 1);
    const heightScale = THREE.MathUtils.clamp((height - 170) / 620, 0.72, 1);
    const rowScale = rows >= 3 ? 0.78 : rows === 2 ? 0.88 : 1;
    const subScale = THREE.MathUtils.clamp(SUBAGENT_SCALE * widthScale * heightScale * rowScale, 0.2, SUBAGENT_SCALE);
    const spacingX = Math.max(baseAsset.rowSpacing * widthScale * 0.96, baseAsset.size.x * subScale * 1.45);
    const rowGap = Math.max(baseAsset.size.y * subScale * 1.3, 0.28);
    const compactness = THREE.MathUtils.clamp(Math.max((560 - width) / 260, (760 - height) / 260), 0, 1);
    const stackCenterY = baseAsset.subY + compactness * 0.34 + Math.max(0, rows - 1) * 0.08;
    const rootScale = THREE.MathUtils.clamp(ROOT_SCALE * (1 - compactness * 0.16) * (rows >= 3 ? 0.92 : 1), 0.8, ROOT_SCALE);
    const rootY = baseAsset.rootY + compactness * 0.24 + Math.max(0, rows - 1) * 0.08;
    const cameraDistance = baseAsset.maxDim * (3.7 + compactness * 1.05 + Math.max(0, rows - 1) * 0.42);
    const cameraY = baseAsset.size.y * (0.04 + compactness * 0.08 + Math.max(0, rows - 1) * 0.02);
    const cameraLookAtY = THREE.MathUtils.lerp(0.05, rootY * 0.28, 0.72);
    const overlayScale = THREE.MathUtils.clamp(slotWidthPx / 176, 0.72, 1);

    return {
        columns,
        rows,
        slotWidthPx,
        overlayScale,
        rootScale,
        rootY,
        subScale,
        spacingX,
        rowGap,
        stackCenterY,
        cameraDistance,
        cameraLookAtY,
        cameraY,
    };
}

function layoutSubagents() {
    if (!baseAsset) return;

    const active = [...avatars.values()]
        .filter((avatar) => !avatar.isRoot && avatar.inLayout)
        .sort((a, b) => a.createdAt - b.createdAt);

    layoutState = computeLayoutState(active.length);
    document.body.classList.toggle('compact-layout', layoutState.slotWidthPx < 156);
    document.body.classList.toggle('tiny-layout', layoutState.slotWidthPx < 136);

    const topRowY = layoutState.stackCenterY + ((layoutState.rows - 1) * layoutState.rowGap) / 2;

    active.forEach((avatar, index) => {
        const row = Math.floor(index / layoutState.columns);
        const rowStart = row * layoutState.columns;
        const itemsInRow = Math.min(layoutState.columns, active.length - rowStart);
        const column = index - rowStart;
        const centerOffset = (itemsInRow - 1) / 2;

        avatar.baseScale = layoutState.subScale;
        avatar.targetPosition.set(
            (column - centerOffset) * layoutState.spacingX,
            topRowY - row * layoutState.rowGap,
            0,
        );
    });

    const rootAvatar = avatars.get(ROOT_AGENT_ID);
    if (rootAvatar) {
        rootAvatar.baseScale = layoutState.rootScale;
        rootAvatar.targetPosition.set(0, layoutState.rootY, 0);
    }

    updateCamera(layoutState);
}

function getResolvedActivity(avatar, now = performance.now()) {
    if (avatar.activeTools.size > 0) {
        let latest = null;
        for (const entry of avatar.activeTools.values()) {
            if (!latest || entry.startedAt > latest.startedAt) {
                latest = entry;
            }
        }
        return latest?.activity || 'idle';
    }

    if (avatar.thinkingUntil > now) {
        return 'thinking';
    }

    return 'idle';
}

function getVisualMode(avatar, now = performance.now()) {
    if (avatar.expressionUntil > now) {
        return avatar.expressionName;
    }

    if (avatar.isRoot) {
        const rootMode = getActiveRootEmotion(now);
        if (rootMode !== 'default') {
            return rootMode;
        }
    }

    return getResolvedActivity(avatar, now);
}

function updateAvatarBadge(avatar, now = performance.now()) {
    if (!avatar.overlay) return;

    const activity = avatar.effectState === 'failed'
        ? 'failed'
        : avatar.effectState === 'success'
            ? 'success'
            : getResolvedActivity(avatar, now);

    const badge = ACTIVITY_BADGES[activity] || ACTIVITY_BADGES.idle;
    const badgeText = avatar.intentText && avatar.intentUntil > now ? avatar.intentText : badge.text;
    avatar.overlay.badgeEl.className = `agent-badge ${activity}`;
    avatar.overlay.badgeIconEl.textContent = badge.icon;
    avatar.overlay.badgeTextEl.textContent = badgeText;
}

function beginAvatarRemoval(avatar) {
    avatar.inLayout = false;
    avatar.leaving = true;
    avatar.targetPresence = 0;
    layoutSubagents();
}

function finalizeAvatar(agentId) {
    const avatar = avatars.get(agentId);
    if (!avatar || avatar.isRoot) return;
    disposeAvatar(avatar);
    avatars.delete(agentId);
}

function spawnParticleBurst(avatar, count = 34) {
    avatar.group.localToWorld(confettiOriginVector.set(0, 0.16, baseAsset.eyeZ * 0.75));

    for (let index = 0; index < count; index += 1) {
        const material = new THREE.SpriteMaterial({
            map: particleTexture,
            color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
            transparent: true,
            opacity: 1,
            depthWrite: false,
        });
        const sprite = new THREE.Sprite(material);
        const scale = 0.032 + Math.random() * 0.034;
        sprite.position.copy(confettiOriginVector);
        sprite.scale.set(scale, scale, scale);
        scene.add(sprite);

        particles.push({
            sprite,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 1.2,
                0.55 + Math.random() * 1.05,
                (Math.random() - 0.5) * 0.5,
            ),
            gravity: 1.65 + Math.random() * 0.55,
            life: 0,
            ttl: 1.1 + Math.random() * 0.45,
            spin: (Math.random() - 0.5) * 8,
        });
    }
}

function updateParticles(dt) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.life += dt;

        if (particle.life >= particle.ttl) {
            scene.remove(particle.sprite);
            particle.sprite.material.dispose();
            particles.splice(index, 1);
            continue;
        }

        particle.velocity.y -= particle.gravity * dt;
        particle.sprite.position.addScaledVector(particle.velocity, dt);
        particle.sprite.material.opacity = 1 - particle.life / particle.ttl;
        particle.sprite.material.rotation += particle.spin * dt;
    }
}

function triggerRootBurst(kind) {
    const rootAvatar = avatars.get(ROOT_AGENT_ID);
    if (!rootAvatar) return;
    const count = kind === 'sparkle' ? 22 : 40;
    spawnParticleBurst(rootAvatar, count);
    if (kind === 'party') {
        setTimeout(() => {
            if (avatars.has(ROOT_AGENT_ID)) spawnParticleBurst(rootAvatar, 28);
        }, 180);
        setTimeout(() => {
            if (avatars.has(ROOT_AGENT_ID)) spawnParticleBurst(rootAvatar, 24);
        }, 360);
    }
}

function setAvatarExpression(avatar, name, durationMs) {
    avatar.expressionName = name;
    avatar.expressionUntil = performance.now() + durationMs;
}

function humanizeError(error) {
    if (!error) return 'Failed';
    return String(error).split('\n')[0].trim() || 'Failed';
}

function setOverlayPosition(avatar) {
    if (!avatar.overlay) return;

    avatar.group.updateWorldMatrix(true, true);
    avatar.group.localToWorld(worldVector.copy(baseAsset.overlayOffset));
    overlayVector.copy(worldVector).project(camera);

    const onScreen = overlayVector.z > -1 && overlayVector.z < 1
        && overlayVector.x > -1.2 && overlayVector.x < 1.2
        && overlayVector.y > -1.2 && overlayVector.y < 1.2
        && avatar.presence > 0.05;

    if (!onScreen) {
        avatar.overlay.labelEl.classList.remove('visible');
        avatar.overlay.labelEl.style.opacity = '0';
        return;
    }

    const x = (overlayVector.x * 0.5 + 0.5) * container.clientWidth;
    const y = (-overlayVector.y * 0.5 + 0.5) * container.clientHeight;
    const scale = layoutState.overlayScale * (0.92 + avatar.presence * 0.08);
    avatar.overlay.labelEl.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
    avatar.overlay.labelEl.style.opacity = `${Math.max(0, Math.min(1, avatar.presence))}`;
    avatar.overlay.labelEl.classList.add('visible');
}

function updateEmotionBubblePosition() {
    if (!emotionBubbleEl.classList.contains('visible')) return;
    const rootAvatar = avatars.get(ROOT_AGENT_ID);
    if (!rootAvatar) return;

    rootAvatar.group.updateWorldMatrix(true, true);
    rootAvatar.eyeR.getWorldPosition(rightEyeVector);
    rightEyeVector.project(camera);
    const x = (rightEyeVector.x * 0.5 + 0.5) * container.clientWidth + 44;
    const y = (-rightEyeVector.y * 0.5 + 0.5) * container.clientHeight - 64;
    emotionBubbleEl.style.left = `${x}px`;
    emotionBubbleEl.style.top = `${y}px`;
}

function updateBlinkState(avatar, visual, dt, now) {
    const restBlink = visual.restBlink ?? 1;
    let leftBlink = restBlink;
    let rightBlink = restBlink;

    if (avatar.happyBlinkUntil > now) {
        const phase = 1 - (avatar.happyBlinkUntil - now) / 420;
        const blink = Math.max(0.02, Math.abs(Math.cos(phase * Math.PI * 1.8)));
        avatar.eyeMatL.uniforms.uBlink.value = blink;
        avatar.eyeMatR.uniforms.uBlink.value = blink;
        return;
    }

    if (!visual.blinkEnabled) {
        avatar.anim.isBlinking = false;
        avatar.anim.blinkTimer = 2 + Math.random() * 4;
    } else {
        avatar.anim.blinkTimer -= dt;
        if (avatar.anim.blinkTimer <= 0 && !avatar.anim.isBlinking && !avatar.anim.isWinking) {
            avatar.anim.isBlinking = true;
            avatar.anim.blinkPhase = 1;
            avatar.anim.blinkProgress = 0;
            avatar.anim.blinkTimer = 2 + Math.random() * 4;
        }
    }

    if (avatar.anim.isBlinking) {
        avatar.anim.blinkProgress += dt * 12;
        if (avatar.anim.blinkPhase === 1) {
            const blink = Math.max(0, restBlink * (1 - avatar.anim.blinkProgress * 1.5));
            leftBlink = blink;
            rightBlink = blink;
            if (blink <= 0.02) {
                avatar.anim.blinkPhase = 2;
                avatar.anim.blinkProgress = 0;
            }
        } else {
            const blink = Math.min(restBlink, avatar.anim.blinkProgress * restBlink * 1.5);
            leftBlink = blink;
            rightBlink = blink;
            if (blink >= restBlink) {
                avatar.anim.isBlinking = false;
            }
        }
    }

    if (!visual.winkEnabled) {
        avatar.anim.isWinking = false;
        avatar.anim.winkTimer = 8 + Math.random() * 10;
    } else {
        avatar.anim.winkTimer -= dt;
        if (avatar.anim.winkTimer <= 0 && !avatar.anim.isBlinking && !avatar.anim.isWinking) {
            avatar.anim.isWinking = true;
            avatar.anim.blinkPhase = 1;
            avatar.anim.blinkProgress = 0;
            avatar.anim.winkTimer = 8 + Math.random() * 10;
        }
    }

    if (avatar.anim.isWinking) {
        avatar.anim.blinkProgress += dt * 10;
        if (avatar.anim.blinkPhase === 1) {
            leftBlink = Math.max(0, restBlink * (1 - avatar.anim.blinkProgress * 1.5));
            if (leftBlink <= 0.02) {
                avatar.anim.blinkPhase = 2;
                avatar.anim.blinkProgress = 0;
            }
        } else {
            leftBlink = Math.min(restBlink, avatar.anim.blinkProgress * restBlink * 1.2);
            if (leftBlink >= restBlink) {
                avatar.anim.isWinking = false;
            }
        }
    }

    avatar.eyeMatL.uniforms.uBlink.value = leftBlink;
    avatar.eyeMatR.uniforms.uBlink.value = rightBlink;
}

function getVisualConfig(avatar, mode, dt) {
    const base = {
        color: ACTIVITY_COLORS[getResolvedActivity(avatar)] || ACTIVITY_COLORS.idle,
        eyeMode: 0,
        eyeScaleX: 1,
        eyeScaleY: 1,
        showHeartEyes: false,
        heartPulse: 1,
        maskOpacity: 0,
        blinkEnabled: true,
        winkEnabled: mode === 'idle',
        restBlink: 1,
        bobY: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
    };

    switch (mode) {
        case 'writing':
            base.color = ACTIVITY_COLORS.writing;
            base.bobY = Math.sin(avatar.anim.idleTime * 7.8) * 0.012;
            base.rotX = 0.05 + Math.sin(avatar.anim.idleTime * 9.2) * 0.09;
            base.rotY = Math.sin(avatar.anim.idleTime * 1.9) * 0.03;
            base.rotZ = Math.sin(avatar.anim.idleTime * 8.6) * 0.01;
            base.winkEnabled = false;
            break;
        case 'reading':
            base.color = ACTIVITY_COLORS.reading;
            base.bobY = Math.sin(avatar.anim.idleTime * 2.1) * 0.008;
            base.rotX = -0.03 + Math.cos(avatar.anim.idleTime * 1.8) * 0.02;
            base.rotY = Math.sin(avatar.anim.idleTime * 1.7) * 0.18;
            base.rotZ = Math.sin(avatar.anim.idleTime * 1.1) * 0.01;
            base.winkEnabled = false;
            break;
        case 'running':
            base.color = ACTIVITY_COLORS.running;
            base.bobY = Math.sin(avatar.anim.idleTime * 5.6) * 0.017;
            base.rotX = Math.cos(avatar.anim.idleTime * 5.8) * 0.035;
            base.rotY = Math.sin(avatar.anim.idleTime * 3.2) * 0.08;
            base.rotZ = Math.sin(avatar.anim.idleTime * 6.1) * 0.02;
            base.winkEnabled = false;
            break;
        case 'thinking':
        case 'think':
            base.color = ACTIVITY_COLORS.thinking;
            base.bobY = Math.sin(avatar.anim.idleTime * 1.1) * 0.012;
            base.rotX = -0.09 + Math.cos(avatar.anim.idleTime * 1.1) * 0.02;
            base.rotY = 0.12 + Math.sin(avatar.anim.idleTime * 0.9) * 0.04;
            base.rotZ = -0.015 + Math.sin(avatar.anim.idleTime * 0.7) * 0.012;
            base.restBlink = 0.62;
            base.winkEnabled = false;
            break;
        case 'success':
            base.color = ACTIVITY_COLORS.success;
            base.bobY = Math.sin(avatar.anim.idleTime * 4.6) * 0.018;
            base.rotX = 0.04 + Math.sin(avatar.anim.idleTime * 8.8) * 0.08;
            base.rotY = Math.sin(avatar.anim.idleTime * 2.4) * 0.05;
            base.rotZ = Math.sin(avatar.anim.idleTime * 4.5) * 0.02;
            base.winkEnabled = false;
            break;
        case 'failed':
        case 'error':
            base.color = ACTIVITY_COLORS.failed;
            base.bobY = -0.01 + Math.sin(avatar.anim.idleTime * 2.4) * 0.005;
            base.rotX = -0.12 + Math.cos(avatar.anim.idleTime * 1.3) * 0.02;
            base.rotY = Math.sin(avatar.anim.idleTime * 1.4) * 0.05;
            base.rotZ = -0.04 + Math.sin(avatar.anim.idleTime * 0.9) * 0.015;
            base.winkEnabled = false;
            break;
        case 'party':
            base.color = new THREE.Color(0xfff08f);
            base.eyeMode = 1;
            base.eyeScaleX = 1.12;
            base.eyeScaleY = 0.76;
            base.bobY = Math.sin(avatar.anim.idleTime * 9.2) * 0.028;
            base.rotX = Math.cos(avatar.anim.idleTime * 5.0) * 0.04;
            base.rotY = Math.sin(avatar.anim.idleTime * 7.2) * 0.08;
            base.rotZ = 0.02 + Math.sin(avatar.anim.idleTime * 13.5) * 0.055;
            base.winkEnabled = false;
            break;
        case 'laugh':
            base.color = new THREE.Color(0xffe38a);
            base.eyeMode = 1;
            base.eyeScaleX = 1.08;
            base.eyeScaleY = 0.72;
            base.bobY = Math.sin(avatar.anim.idleTime * 8.5) * 0.025;
            base.rotX = Math.cos(avatar.anim.idleTime * 4.5) * 0.03;
            base.rotY = Math.sin(avatar.anim.idleTime * 6.4) * 0.07;
            base.rotZ = Math.sin(avatar.anim.idleTime * 12.5) * 0.04;
            base.winkEnabled = false;
            break;
        case 'heart':
            base.color = new THREE.Color(0xff8fc7);
            base.showHeartEyes = true;
            base.heartPulse = 1 + Math.sin(avatar.anim.idleTime * 5.5) * 0.06;
            base.bobY = Math.sin(avatar.anim.idleTime * 2.2) * 0.03;
            base.rotX = -0.04 + Math.cos(avatar.anim.idleTime * 1.8) * 0.02;
            base.rotY = Math.sin(avatar.anim.idleTime * 1.4) * 0.16;
            base.rotZ = Math.sin(avatar.anim.idleTime * 2.6) * 0.05;
            base.blinkEnabled = false;
            base.winkEnabled = false;
            break;
        case 'warning':
            base.color = new THREE.Color(0xffb86b);
            base.eyeScaleX = 1.03;
            base.eyeScaleY = 0.82;
            base.bobY = Math.sin(avatar.anim.idleTime * 3.0) * 0.01;
            base.rotX = -0.02 + Math.cos(avatar.anim.idleTime * 3.2) * 0.03;
            base.rotY = Math.sin(avatar.anim.idleTime * 3.4) * 0.08;
            base.rotZ = Math.sin(avatar.anim.idleTime * 6.0) * 0.02;
            break;
        case 'sparkle':
            base.color = new THREE.Color(0xfff0a8);
            base.eyeScaleX = 1.05 + Math.sin(avatar.anim.idleTime * 4.6) * 0.03;
            base.eyeScaleY = base.eyeScaleX;
            base.bobY = Math.sin(avatar.anim.idleTime * 2.6) * 0.02;
            base.rotX = Math.cos(avatar.anim.idleTime * 1.8) * 0.03;
            base.rotY = Math.sin(avatar.anim.idleTime * 2.2) * 0.06;
            base.rotZ = Math.sin(avatar.anim.idleTime * 4.0) * 0.025;
            break;
        case 'sleep':
            base.color = new THREE.Color(0x9fb5ff);
            base.eyeMode = 2;
            base.eyeScaleX = 1.04;
            base.eyeScaleY = 0.72;
            base.bobY = Math.sin(avatar.anim.idleTime * 0.9) * 0.01;
            base.rotX = -0.1 + Math.sin(avatar.anim.idleTime * 0.6) * 0.03;
            base.rotY = Math.sin(avatar.anim.idleTime * 0.35) * 0.04;
            base.rotZ = -0.03 + Math.sin(avatar.anim.idleTime * 0.45) * 0.015;
            base.blinkEnabled = false;
            base.winkEnabled = false;
            break;
        case 'raccoon':
            base.color = new THREE.Color(0xf3f7ff);
            base.maskOpacity = 0.82;
            base.bobY = Math.sin(avatar.anim.idleTime * 1.8) * 0.015;
            base.rotX = Math.cos(avatar.anim.idleTime * 1.5) * 0.03;
            base.rotY = Math.sin(avatar.anim.idleTime * 1.9) * 0.25;
            base.rotZ = Math.sin(avatar.anim.idleTime * 2.3) * 0.035;
            break;
        default:
            base.color = ACTIVITY_COLORS.idle;
            avatar.anim.wanderTimer -= dt;
            if (avatar.anim.wanderTimer <= 0) {
                avatar.anim.targetRotY = (Math.random() - 0.5) * 0.3;
                avatar.anim.targetRotX = (Math.random() - 0.5) * 0.1;
                avatar.anim.wanderTimer = 2.5 + Math.random() * 3;
            }
            base.bobY = Math.sin(avatar.anim.idleTime * 1.2) * 0.02;
            base.rotX = avatar.anim.targetRotX;
            base.rotY = avatar.anim.targetRotY;
            base.rotZ = Math.sin(avatar.anim.idleTime * 0.6) * 0.015;
            break;
    }

    if (avatar.flashUntil > performance.now()) {
        base.color = ACTIVITY_COLORS.failed;
    }

    return base;
}

function updateAvatar(avatar, dt, now) {
    avatar.anim.idleTime += dt;

    if (avatar.intentUntil <= now && avatar.intentText) {
        avatar.intentText = '';
    }

    if (!avatar.isRoot && avatar.leaveAt > 0 && now >= avatar.leaveAt && avatar.inLayout) {
        beginAvatarRemoval(avatar);
    }

    avatar.currentPosition.lerp(avatar.targetPosition, 1 - Math.exp(-dt * 8));
    avatar.presence += (avatar.targetPresence - avatar.presence) * (1 - Math.exp(-dt * 10));

    if (!avatar.isRoot && avatar.leaving && avatar.presence <= 0.03) {
        finalizeAvatar(avatar.agentId);
        return;
    }

    const visualMode = getVisualMode(avatar, now);
    const resolvedActivity = getResolvedActivity(avatar, now);
    const visual = getVisualConfig(avatar, visualMode, dt);
    const scalePulse = avatar.scalePulseUntil > now ? 1 + Math.sin((now / 1000) * 20) * 0.08 : 1;
    const motionEase = 1 - Math.exp(-dt * (avatar.isRoot ? 7 : 9));
    const eyeEase = 1 - Math.exp(-dt * 12);
    avatar.currentScale += ((avatar.baseScale * avatar.presence) - avatar.currentScale) * (1 - Math.exp(-dt * 10));
    avatar.currentEyeColor.lerp(visual.color, 1 - Math.exp(-dt * 9));
    avatar.currentBobY += (visual.bobY - avatar.currentBobY) * motionEase;
    avatar.currentRotX += (visual.rotX - avatar.currentRotX) * motionEase;
    avatar.currentRotY += (visual.rotY - avatar.currentRotY) * motionEase;
    avatar.currentRotZ += (visual.rotZ - avatar.currentRotZ) * motionEase;
    avatar.currentEyeScaleX += (visual.eyeScaleX - avatar.currentEyeScaleX) * eyeEase;
    avatar.currentEyeScaleY += (visual.eyeScaleY - avatar.currentEyeScaleY) * eyeEase;
    avatar.currentHeartPulse += (visual.heartPulse - avatar.currentHeartPulse) * eyeEase;
    avatar.currentWritingFx += ((resolvedActivity === 'writing' ? 1 : 0) - avatar.currentWritingFx) * eyeEase;
    avatar.currentReadingFx += ((resolvedActivity === 'reading' ? 1 : 0) - avatar.currentReadingFx) * eyeEase;
    avatar.currentThinkingFx += ((resolvedActivity === 'thinking' ? 1 : 0) - avatar.currentThinkingFx) * eyeEase;

    let shakeX = 0;
    if (avatar.shakeUntil > now) {
        shakeX = Math.sin(now * 0.08) * 0.04;
    }

    avatar.group.position.set(
        avatar.currentPosition.x + shakeX,
        avatar.currentPosition.y + avatar.currentBobY,
        avatar.currentPosition.z,
    );
    avatar.group.rotation.set(avatar.currentRotX, avatar.currentRotY, avatar.currentRotZ);
    avatar.group.scale.setScalar(Math.max(0.0001, avatar.currentScale * scalePulse));

    avatar.eyeMatL.uniforms.uTime.value = avatar.anim.idleTime;
    avatar.eyeMatR.uniforms.uTime.value = avatar.anim.idleTime;
    avatar.eyeMatL.uniforms.uMode.value = visual.eyeMode;
    avatar.eyeMatR.uniforms.uMode.value = visual.eyeMode;
    avatar.eyeMatL.uniforms.uColor.value.copy(avatar.currentEyeColor);
    avatar.eyeMatR.uniforms.uColor.value.copy(avatar.currentEyeColor);

    avatar.eyeL.visible = !visual.showHeartEyes;
    avatar.eyeR.visible = !visual.showHeartEyes;
    avatar.heartEyeL.visible = visual.showHeartEyes;
    avatar.heartEyeR.visible = visual.showHeartEyes;
    avatar.heartEyeL.scale.setScalar((avatar.heartEyeL.userData.baseScale || baseAsset.heartScale) * avatar.currentHeartPulse);
    avatar.heartEyeR.scale.setScalar((avatar.heartEyeR.userData.baseScale || baseAsset.heartScale) * avatar.currentHeartPulse);
    avatar.eyeL.scale.set(avatar.currentEyeScaleX, avatar.currentEyeScaleY, 1);
    avatar.eyeR.scale.set(avatar.currentEyeScaleX, avatar.currentEyeScaleY, 1);

    avatar.currentMaskOpacity += (visual.maskOpacity - avatar.currentMaskOpacity) * (1 - Math.exp(-dt * 10));
    avatar.raccoonMask.visible = avatar.currentMaskOpacity > 0.01;
    avatar.raccoonMask.material.opacity = avatar.currentMaskOpacity;
    for (const glyph of avatar.writingGlyphs) {
        const writingOpacity = avatar.currentWritingFx * (0.38 + (Math.sin(avatar.anim.idleTime * 4.6 * glyph.speed + glyph.phase) + 1) * 0.18);
        glyph.sprite.visible = writingOpacity > 0.03;
        glyph.material.opacity = writingOpacity;
        glyph.material.rotation = Math.sin(avatar.anim.idleTime * 1.8 + glyph.phase) * 0.08;
        glyph.sprite.position.set(
            Math.cos(avatar.anim.idleTime * glyph.speed + glyph.phase) * glyph.orbitRadius,
            glyph.verticalOffset + Math.sin(avatar.anim.idleTime * 2.2 + glyph.phase * 1.7) * 0.05,
            baseAsset.eyeZ + 0.12 + Math.sin(avatar.anim.idleTime * 1.9 + glyph.phase) * 0.04 * glyph.drift,
        );
        const glyphScale = glyph.size * (0.92 + Math.sin(avatar.anim.idleTime * 3.1 + glyph.phase) * 0.08);
        glyph.sprite.scale.setScalar(glyphScale);
    }
    const readingBeam = avatar.activityEffects.readingBeam;
    const readingBeamMaterial = avatar.activityEffects.readingBeamMaterial;
    readingBeam.visible = avatar.currentReadingFx > 0.04;
    readingBeamMaterial.opacity = avatar.currentReadingFx * 0.42;
    readingBeam.position.x = Math.sin(avatar.anim.idleTime * 1.7) * baseAsset.eyeSpacing * 1.45;
    readingBeam.scale.x = baseAsset.readingBeamWidth * (0.82 + (Math.sin(avatar.anim.idleTime * 2.5) + 1) * 0.1);
    readingBeam.scale.y = baseAsset.readingBeamHeight;

    for (const dot of avatar.activityEffects.thinkingDots) {
        const orbitAngle = avatar.anim.idleTime * 0.85 + dot.phase;
        const bob = Math.sin(avatar.anim.idleTime * 1.6 + dot.phase * 1.5) * 0.03;
        dot.sprite.visible = avatar.currentThinkingFx > 0.04;
        dot.material.opacity = avatar.currentThinkingFx * (0.22 + (Math.sin(avatar.anim.idleTime * 2 + dot.phase) + 1) * 0.08);
        dot.sprite.position.set(
            Math.cos(orbitAngle) * (baseAsset.thinkingOrbitRadius + dot.orbitRadius * 0.4),
            baseAsset.thinkingCenterY + bob,
            baseAsset.eyeZ + 0.08 + Math.sin(orbitAngle) * 0.05,
        );
        const dotScale = baseAsset.thinkingDotSize * dot.size * (0.9 + (Math.sin(avatar.anim.idleTime * 2.2 + dot.phase) + 1) * 0.08);
        dot.sprite.scale.setScalar(dotScale);
    }

    updateBlinkState(avatar, visual, dt, now);
    updateAvatarBadge(avatar, now);
    setOverlayPosition(avatar);
}

function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000 || 1 / 60);
    lastFrameTime = now;

    updateParticles(dt);
    for (const avatar of [...avatars.values()]) {
        updateAvatar(avatar, dt, now);
    }

    scene.updateMatrixWorld(true);
    updateEmotionBubble(getActiveRootEmotion(now));
    updateEmotionBubblePosition();
    renderer.render(scene, camera);
}

function startAnimation() {
    if (animationStarted) return;
    animationStarted = true;
    requestAnimationFrame((now) => {
        lastFrameTime = now;
        animate(now);
    });
}

function updateCamera(layout = layoutState) {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    camera.aspect = width / height;
    camera.position.set(
        0,
        baseAsset ? layout.cameraY : 0.05,
        baseAsset ? layout.cameraDistance : 3.2,
    );
    camera.lookAt(0, layout.cameraLookAtY, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function initializeRootAvatar() {
    ensureAvatar(ROOT_AGENT_ID, { displayName: 'Copilot' });
}

window.showMessage = (text) => {
    if (fadeTimeout) clearTimeout(fadeTimeout);
    registerRootActivity();

    const emotion = detectEmotion(text);
    if (emotion) {
        setRootEmotion(emotion, emotion === 'party' ? 5200 : EMOTION_HOLD_MS);
        if (emotion === 'party' || emotion === 'sparkle') {
            triggerRootBurst(emotion);
        }
    }

    messageEl.classList.remove('fading');
    messageEl.classList.add('visible');
    messageEl.textContent = text;
    speak(text);

    fadeTimeout = setTimeout(() => {
        messageEl.classList.add('fading');
        messageEl.classList.remove('visible');
    }, MESSAGE_FADE_MS);
};

window.setWorking = (active) => {
    rootWorking = !!active;
    if (active) {
        registerRootActivity();
    } else {
        subtasksEl.textContent = '';
    }
    updateStatusIndicator();
};

window.setSubtask = (text) => {
    if (text) registerRootActivity();
    subtasksEl.textContent = text || '';
};

window.addSubagent = (payload = {}) => {
    if (!payload.agentId) {
        pendingSubagents.push(payload);
        return;
    }

    const avatar = ensureAvatar(payload.agentId, payload);
    avatar.targetPresence = 1;
    avatar.presence = Math.max(avatar.presence, 0.01);
    avatar.leaving = false;
    avatar.inLayout = true;
    avatar.effectState = 'idle';
    avatar.leaveAt = 0;
    layoutSubagents();
};

window.completeSubagent = (payload = {}) => {
    if (!payload.agentId) return;
    const avatar = ensureAvatar(payload.agentId, payload);
    avatar.activeTools.clear();
    avatar.thinkingUntil = 0;
    avatar.effectState = 'success';
    avatar.leaveAt = performance.now() + COMPLETION_HOLD_MS;
    avatar.scalePulseUntil = performance.now() + 700;
    avatar.happyBlinkUntil = performance.now() + 420;
    avatar.intentText = payload.totalToolCalls != null ? `${payload.totalToolCalls} tool calls` : 'Completed';
    avatar.intentUntil = performance.now() + COMPLETION_HOLD_MS;
    setAvatarExpression(avatar, 'success', COMPLETION_HOLD_MS);
    spawnParticleBurst(avatar, 42);
};

window.failSubagent = (payload = {}) => {
    if (!payload.agentId) return;
    const avatar = ensureAvatar(payload.agentId, payload);
    avatar.activeTools.clear();
    avatar.thinkingUntil = 0;
    avatar.effectState = 'failed';
    avatar.leaveAt = performance.now() + FAILURE_HOLD_MS;
    avatar.flashUntil = performance.now() + 360;
    avatar.shakeUntil = performance.now() + 720;
    avatar.intentText = humanizeError(payload.error);
    avatar.intentUntil = performance.now() + FAILURE_HOLD_MS;
    setAvatarExpression(avatar, 'failed', FAILURE_HOLD_MS);
};

window.setAgentActivity = (payload = {}) => {
    const avatar = ensureAvatar(payload.agentId || ROOT_AGENT_ID, payload);
    if (!avatar.isRoot && (avatar.effectState === 'success' || avatar.effectState === 'failed')) return;
    const key = payload.toolCallId || `${payload.toolName || 'tool'}:${performance.now()}`;
    avatar.activeTools.set(key, {
        toolName: payload.toolName || '',
        activity: classifyTool(payload.toolName || ''),
        startedAt: performance.now(),
    });
    avatar.effectState = 'idle';
    if (avatar.isRoot) registerRootActivity();
};

window.clearAgentActivity = (payload = {}) => {
    const avatar = avatars.get(payload.agentId || ROOT_AGENT_ID);
    if (!avatar) return;
    if (!avatar.isRoot && (avatar.effectState === 'success' || avatar.effectState === 'failed')) return;

    if (payload.toolCallId && avatar.activeTools.has(payload.toolCallId)) {
        avatar.activeTools.delete(payload.toolCallId);
    } else if (payload.toolName) {
        for (const [key, value] of avatar.activeTools.entries()) {
            if (value.toolName === payload.toolName) {
                avatar.activeTools.delete(key);
                break;
            }
        }
    }
};

window.setAgentThinking = (agentId) => {
    const avatar = ensureAvatar(agentId || ROOT_AGENT_ID);
    if (!avatar.isRoot && (avatar.effectState === 'success' || avatar.effectState === 'failed')) return;
    avatar.thinkingUntil = performance.now() + THINKING_HOLD_MS;
    if (avatar.isRoot) registerRootActivity();
};

window.setAgentIntent = (payload = {}) => {
    const avatar = ensureAvatar(payload.agentId || ROOT_AGENT_ID, payload);
    if (!avatar.isRoot && (avatar.effectState === 'success' || avatar.effectState === 'failed')) return;
    avatar.intentText = payload.intent || '';
    avatar.intentUntil = performance.now() + INTENT_HOLD_MS;
    if (avatar.isRoot) registerRootActivity();
};

window.setAgentExpression = (payload = {}) => {
    const avatar = ensureAvatar(payload.agentId || ROOT_AGENT_ID, payload);
    const expression = payload.expression || 'default';
    const durationMs = Math.max(100, Number(payload.durationMs) || 4000);
    setAvatarExpression(avatar, expression, durationMs);
};

const VOXTRAL_VOICES_EN = [
    'casual_male', 'casual_female',
    'formal_male', 'formal_female',
    'energetic_male', 'energetic_female',
    'calm_male', 'calm_female',
];

let ttsEnabled = false;
let ttsRate = 1.1;
let ttsPitch = 1.0;
let ttsVoiceName = null;
let ttsEngine = 'webspeech';
let voxtralBackend = 'cloud';
let voxtralUrl = 'http://localhost:18000';
let voxtralApiKey = '';
let voxtralVoice = 'casual_male';
let voxtralVoiceSource = 'preset';
let voxtralRefAudio = null;

// Recording state
let mediaRecorder = null;
let recordingChunks = [];
let recordingTimerInterval = null;
let recordingStartTime = 0;

let savedTts = {};
try {
    savedTts = await copilot.loadSettings() || {};
} catch {
    savedTts = {};
}

if (savedTts.rate) {
    ttsRate = savedTts.rate;
    ttsRateInput.value = ttsRate;
    ttsRateValue.textContent = `${ttsRate.toFixed(1)}×`;
}
if (savedTts.pitch != null) {
    ttsPitch = savedTts.pitch;
    ttsPitchInput.value = ttsPitch;
    ttsPitchValue.textContent = ttsPitch.toFixed(1);
}
if (savedTts.voice) {
    ttsVoiceName = savedTts.voice;
}
if (savedTts.enabled) {
    ttsEnabled = true;
}
if (savedTts.engine) {
    ttsEngine = savedTts.engine;
    ttsEngineSelect.value = ttsEngine;
}
if (savedTts.voxtralBackend) {
    voxtralBackend = savedTts.voxtralBackend;
    document.querySelectorAll('input[name="voxtral-backend"]').forEach((r) => {
        r.checked = r.value === voxtralBackend;
    });
}
if (savedTts.voxtralUrl) {
    voxtralUrl = savedTts.voxtralUrl;
    voxtralUrlInput.value = voxtralUrl;
}
if (savedTts.voxtralApiKey) {
    voxtralApiKey = savedTts.voxtralApiKey;
    voxtralApikeyInput.value = voxtralApiKey;
}
if (savedTts.voxtralVoice) {
    voxtralVoice = savedTts.voxtralVoice;
}
if (savedTts.voxtralVoiceSource) {
    voxtralVoiceSource = savedTts.voxtralVoiceSource;
    document.querySelectorAll('input[name="voxtral-voice-source"]').forEach((radio) => {
        radio.checked = radio.value === voxtralVoiceSource;
    });
}
if (savedTts.voxtralRefAudio) {
    voxtralRefAudio = savedTts.voxtralRefAudio;
    voxtralAudioPreview.src = voxtralRefAudio;
    voxtralAudioPreview.classList.remove('hidden');
    voxtralRerecordBtn.classList.remove('hidden');
}
updateTtsButton();
updateEngineUI();

function saveTtsSettings() {
    copilot.saveSettings({
        enabled: ttsEnabled,
        rate: ttsRate,
        pitch: ttsPitch,
        voice: ttsVoiceName,
        engine: ttsEngine,
        voxtralBackend,
        voxtralUrl,
        voxtralApiKey,
        voxtralVoice,
        voxtralVoiceSource,
        voxtralRefAudio,
    }).catch(() => {});
}

function updateBackendUI() {
    const isCloud = voxtralBackend === 'cloud';
    voxtralCloudSection.classList.toggle('hidden', !isCloud);
    voxtralLocalSection.classList.toggle('hidden', isCloud);
    if (isCloud) {
        populateVoxtralVoices(VOXTRAL_VOICES_EN);
    } else {
        fetchVoxtralVoices();
    }
}

function updateEngineUI() {
    const isVoxtral = ttsEngine === 'voxtral';
    ttsWebspeechSection.classList.toggle('hidden', isVoxtral);
    ttsVoxtralSection.classList.toggle('hidden', !isVoxtral);
    if (isVoxtral) {
        const isMyVoice = voxtralVoiceSource === 'myvoice';
        voxtralPresetSection.classList.toggle('hidden', isMyVoice);
        voxtralRecordSection.classList.toggle('hidden', !isMyVoice);
        updateBackendUI();
    }
}

function populateVoices() {
    const voices = speechSynthesis.getVoices();
    ttsVoiceSelect.innerHTML = '';
    voices.forEach((voice) => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        option.selected = voice.name === ttsVoiceName;
        ttsVoiceSelect.appendChild(option);
    });
}

function populateVoxtralVoices(voiceNames) {
    voxtralVoiceSelect.innerHTML = '';
    voiceNames.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name.replace(/_/g, ' ');
        option.selected = name === voxtralVoice;
        voxtralVoiceSelect.appendChild(option);
    });
}

async function fetchVoxtralVoices() {
    if (voxtralBackend === 'cloud') {
        populateVoxtralVoices(VOXTRAL_VOICES_EN);
        return;
    }
    try {
        const headers = voxtralApiKey ? { 'Authorization': `Bearer ${voxtralApiKey}` } : {};
        const res = await fetch(`${voxtralUrl}/v1/audio/voices`, { headers });
        if (res.ok) {
            const data = await res.json();
            const names = Array.isArray(data) ? data : (data.voices ?? VOXTRAL_VOICES_EN);
            populateVoxtralVoices(names);
            return;
        }
    } catch {
        // fall through to defaults
    }
    populateVoxtralVoices(VOXTRAL_VOICES_EN);
}

populateVoxtralVoices(VOXTRAL_VOICES_EN);
speechSynthesis.onvoiceschanged = populateVoices;
populateVoices();

// ── Recording ─────────────────────────────────────────────────────────────────

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordingChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordingChunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            const blob = new Blob(recordingChunks, { type: 'audio/webm' });
            const dataUrl = await blobToBase64(blob);
            voxtralRefAudio = dataUrl;
            voxtralAudioPreview.src = dataUrl;
            voxtralAudioPreview.classList.remove('hidden');
            voxtralRerecordBtn.classList.remove('hidden');
            voxtralRecordBtn.classList.add('hidden');
            voxtralRecordBtn.classList.remove('recording');
            voxtralStopBtn.classList.add('hidden');
            voxtralRecordTimer.classList.add('hidden');
            clearInterval(recordingTimerInterval);
            saveTtsSettings();
        };
        mediaRecorder.start();
        recordingStartTime = Date.now();
        voxtralRecordBtn.classList.add('recording');
        voxtralRecordTimer.textContent = '0s';
        voxtralRecordTimer.classList.remove('hidden');
        voxtralStopBtn.classList.remove('hidden');
        voxtralAudioPreview.classList.add('hidden');
        voxtralRerecordBtn.classList.add('hidden');
        recordingTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            voxtralRecordTimer.textContent = `${elapsed}s`;
        }, 500);
    } catch (err) {
        console.error('Microphone access denied:', err);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

// ── TTS engines ───────────────────────────────────────────────────────────────

function speakWebSpeech(text) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = ttsRate;
    utterance.pitch = ttsPitch;
    if (ttsVoiceName) {
        const voice = speechSynthesis.getVoices().find((item) => item.name === ttsVoiceName);
        if (voice) utterance.voice = voice;
    }
    speechSynthesis.speak(utterance);
}

async function speakVoxtral(text) {
    try {
        const isCloud = voxtralBackend === 'cloud';
        const apiUrl = isCloud ? 'https://api.mistral.ai' : voxtralUrl;
        const model = isCloud ? 'voxtral-v0.3' : 'mistralai/Voxtral-4B-TTS-2603';
        const body = {
            input: text,
            model,
            response_format: 'wav',
        };
        if (voxtralVoiceSource === 'myvoice' && voxtralRefAudio) {
            // Strip the data URL prefix to get raw base64
            body.ref_audio = voxtralRefAudio.includes(',')
                ? voxtralRefAudio.split(',')[1]
                : voxtralRefAudio;
        } else {
            body.voice = voxtralVoice;
        }
        const reqHeaders = { 'Content-Type': 'application/json' };
        if (voxtralApiKey) reqHeaders['Authorization'] = `Bearer ${voxtralApiKey}`;
        const res = await fetch(`${apiUrl}/v1/audio/speech`, {
            method: 'POST',
            headers: reqHeaders,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            console.error('Voxtral TTS error:', res.status, await res.text());
            return;
        }
        const audioBuffer = await res.arrayBuffer();
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(audioBuffer);
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(ctx.destination);
        source.start();
    } catch (err) {
        console.error('Voxtral TTS failed:', err);
    }
}

function stopAllSpeech() {
    speechSynthesis.cancel();
    // AudioContext sources are fire-and-forget; no global stop needed
}

// ── Event handlers ────────────────────────────────────────────────────────────

ttsToggleBtn.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    updateTtsButton();
    if (!ttsEnabled) stopAllSpeech();
    saveTtsSettings();
});

ttsSettingsBtn.addEventListener('click', () => {
    ttsDropdown.classList.toggle('hidden');
});

ttsEngineSelect.addEventListener('change', () => {
    ttsEngine = ttsEngineSelect.value;
    updateEngineUI();
    saveTtsSettings();
});

ttsVoiceSelect.addEventListener('change', () => {
    ttsVoiceName = ttsVoiceSelect.value;
    saveTtsSettings();
});

ttsRateInput.addEventListener('input', () => {
    ttsRate = parseFloat(ttsRateInput.value);
    ttsRateValue.textContent = `${ttsRate.toFixed(1)}×`;
    saveTtsSettings();
});

ttsPitchInput.addEventListener('input', () => {
    ttsPitch = parseFloat(ttsPitchInput.value);
    ttsPitchValue.textContent = ttsPitch.toFixed(1);
    saveTtsSettings();
});

voxtralUrlInput.addEventListener('change', () => {
    voxtralUrl = voxtralUrlInput.value.trim();
    saveTtsSettings();
});

voxtralApikeyInput.addEventListener('change', () => {
    voxtralApiKey = voxtralApikeyInput.value.trim();
    saveTtsSettings();
});

document.querySelectorAll('input[name="voxtral-backend"]').forEach((radio) => {
    radio.addEventListener('change', () => {
        voxtralBackend = radio.value;
        updateBackendUI();
        saveTtsSettings();
    });
});

voxtralRefreshBtn.addEventListener('click', () => fetchVoxtralVoices());

voxtralVoiceSelect.addEventListener('change', () => {
    voxtralVoice = voxtralVoiceSelect.value;
    saveTtsSettings();
});

document.querySelectorAll('input[name="voxtral-voice-source"]').forEach((radio) => {
    radio.addEventListener('change', () => {
        voxtralVoiceSource = radio.value;
        updateEngineUI();
        saveTtsSettings();
    });
});

voxtralRecordBtn.addEventListener('click', () => startRecording());
voxtralStopBtn.addEventListener('click', () => stopRecording());
voxtralRerecordBtn.addEventListener('click', () => {
    voxtralRefAudio = null;
    voxtralAudioPreview.classList.add('hidden');
    voxtralRerecordBtn.classList.add('hidden');
    voxtralRecordBtn.classList.remove('hidden', 'recording');
    saveTtsSettings();
});

window.setTts = (enabled) => {
    ttsEnabled = !!enabled;
    updateTtsButton();
    if (!ttsEnabled) stopAllSpeech();
    saveTtsSettings();
    return ttsEnabled;
};

window.getTts = () => ttsEnabled;

window.getVoices = () => {
    const voices = speechSynthesis.getVoices();
    return voices.map((voice, index) => `${index}: ${voice.name} (${voice.lang})`).join('\n');
};

window.setVoice = (name) => {
    ttsVoiceName = name;
    ttsVoiceSelect.value = name;
    saveTtsSettings();
    return `Voice set to: ${name}`;
};

window.setRate = (rate) => {
    ttsRate = Math.max(0.5, Math.min(3.0, Number(rate) || 1.1));
    ttsRateInput.value = ttsRate;
    ttsRateValue.textContent = `${ttsRate.toFixed(1)}×`;
    saveTtsSettings();
    return `Rate set to: ${ttsRate}`;
};

window.getTtsSettings = () => JSON.stringify({
    enabled: ttsEnabled,
    rate: ttsRate,
    pitch: ttsPitch,
    voice: ttsVoiceName,
    engine: ttsEngine,
    voxtralBackend,
    voxtralUrl,
    voxtralApiKey,
    voxtralVoice,
    voxtralVoiceSource,
});

function stripMarkdownForSpeech(text) {
    return String(text)
        .replace(/```(?:[\w-]+)?\r?\n([\s\S]*?)```/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/^>\s?/gm, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-+*]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1')
        .replace(/\s*\r?\n\s*/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function speak(text) {
    if (!ttsEnabled || !text) return;
    const spokenText = stripMarkdownForSpeech(text);
    if (!spokenText) return;
    if (ttsEngine === 'voxtral') {
        speakVoxtral(spokenText);
    } else {
        speakWebSpeech(spokenText);
    }
}

const resizeObserver = new ResizeObserver(() => {
    layoutSubagents();
});
resizeObserver.observe(container);

try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('model.glb');
    baseAsset = createBaseAsset(gltf.scene);
} catch {
    baseAsset = createBaseAsset(null);
}

initializeRootAvatar();
layoutSubagents();
updateStatusIndicator();
updateCamera();
startAnimation();
