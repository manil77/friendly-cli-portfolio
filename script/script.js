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
        `Hey there! I’m a software engineer who loves turning coffee ☕ into code.
I've spent the last 3 years building web apps using .NET, NestJS, and PostgreSQL.
I'm obsessed with clean UIs, smooth UX, and making things intuitive and easy to use.

Outside of coding, you’ll find me sketching random ideas or gaming with friends (and internet strangers).`,

    contact: () =>
        `Got a project, idea, or just want to say hi? I'm all ears (and keyboards)!
📧 Email: manil.maharjan07@gmail.com
💼 LinkedIn: <a href="https://www.linkedin.com/in/iammanil" target="_blank">linkedin.com/in/iammanil</a>
📱 Phone: +977 9863777960`,

    skills: () =>
        `💻 Things I know my way around:
Frontend: JavaScript/TypeScript, jQuery, Tailwind, HTML/CSS
Backend: .NET, NestJS, PostgreSQL, SQL Server, REST APIs, Entity Framework, Dapper
DevOps & Tools: Azure DevOps, IIS, Git/GitHub`,

    projects: () =>
        `Here are some of the projects I've had the chance to work on:<br><br>

<div class="project-item">
  <img src="https://www.figma.com/community/resource/655799f6-88b9-4f1c-8b69-5d03eb16de14/thumbnail" alt="RemitX Screenshot" class="project-image" />
  <div class="project-info">
    <strong>RemitX</strong> – A white-label remittance solution.<br>
    A scalable, browser-based system for financial institutions to handle cross-border transfers securely. Built on .NET and SQL Server, it also uses Azure Service Bus and Blob Storage. It has streamlined compliance and made transaction posting ultra-accurate.
  </div>
</div>

<div class="project-item">
  <img src="https://www.figma.com/community/resource/655799f6-88b9-4f1c-8b69-5d03eb16de14/thumbnail" alt="RemitX Screenshot" class="project-image" />
  <div class="project-info">
    <strong>HUKU</strong> – A slick real estate platform.<br>
    Searchable listings, property uploads, image galleries, authentication, visit scheduling, and agent dashboards. Built with Nunjucks, NestJS, and SQLite — everything a local property site needs.
  </div>
</div>

<div class="project-item">
  <img src="https://www.figma.com/community/resource/655799f6-88b9-4f1c-8b69-5d03eb16de14/thumbnail" alt="RemitX Screenshot" class="project-image" />
  <div class="project-info">
    <strong>Heifer PMIS</strong> – Project management for NGOs.<br>
    Built for Heifer International using .NET and PostgreSQL. It tracks projects, budgets, and stakeholders, and includes dashboards, alerts, and document uploads for smoother NGO operations.
  </div>
</div>`,

    history: () => `You’ve entered ${historyCount} commands so far.`,

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
