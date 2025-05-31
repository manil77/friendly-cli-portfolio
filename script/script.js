// Fade out loader after progress animation ends
const progressBar = document.getElementById("progress-bar");
const loaderDiv = document.getElementById("loader");

progressBar.addEventListener("animationend", () => {
    loaderDiv.classList.add("fade-out");
    setTimeout(() => (loaderDiv.style.display = "none"), 1000);
});

// Three.js Scene Setup
const canvas = document.getElementById("bg");
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.z = 6;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 3, 5);
scene.add(directionalLight);

// Earth Sphere Geometry and Material (invisible, used for wireframe base)
const geometry = new THREE.SphereGeometry(2, 64, 64);

// Wireframe setup for subtle lines
const wireframeGeometry = new THREE.WireframeGeometry(geometry);
const earthWireframe = new THREE.LineSegments(
    wireframeGeometry,
    new THREE.LineBasicMaterial({
        color: 0xaaaaaa, // subtle light gray
        opacity: 0.25, // semi-transparent
        transparent: true,
        linewidth: 1,
    })
);
scene.add(earthWireframe);

// Subtle glow using a slightly bigger transparent sphere
const glowGeometry = new THREE.SphereGeometry(2.1, 64, 64);
const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x88ffcc, // soft pale green
    transparent: true,
    opacity: 0.05, // very faint glow
});
const glow = new THREE.Mesh(glowGeometry, glowMaterial);
scene.add(glow);

// Starfield background particles
const starCount = 600;
const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);

for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 200;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 200;
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 200;
}

starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3)
);

const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff, // soft white
    size: 0.3,
    transparent: true,
    opacity: 0.3, // subtle dim stars
});
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now() * 0.001;

    // Smooth slow rotation
    earthWireframe.rotation.y += 0.0015;
    earthWireframe.rotation.x = Math.sin(time * 0.5) * 0.02;

    glow.rotation.copy(earthWireframe.rotation);
    stars.rotation.y += 0.0002;

    renderer.render(scene, camera);
}

animate();

// Handle resize
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// CLI Interaction (unchanged)
const commandInput = document.getElementById("commandInput");
const output = document.getElementById("output");
const typeSound = document.getElementById("typeSound");

const commands = {
    about: () =>
        `Hi, I'm Manil — a creative web developer passionate about crafting fun, engaging web experiences.`,
    contact: () =>
        `Email: manil.maharjan07@gmail.com\nLinkedIn:https://www.linkedin.com/in/iammanil/\nGitHub: https://github.com/manil77`,
    history: () => `You have entered ${historyCount} commands so far.`,
    clear: () => {
        output.innerHTML = "";
        return "";
    },
};

let historyCount = 0;

commandInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    const val = commandInput.value.trim().toLowerCase();
    if (!val) return;
    typeSound.currentTime = 0;
    typeSound.play();

    historyCount++;
    const result = commands[val]
        ? commands[val]()
        : `Command not found: ${val}`;

    if (val !== "clear") {
        const line = document.createElement("div");
        line.className = "output-line";
        line.innerHTML = `<span class="prompt">guest@cli:~$</span> ${val}<br>${result}<br><br>`;
        output.appendChild(line);
    }

    commandInput.value = "";
    output.scrollTop = output.scrollHeight;
});
