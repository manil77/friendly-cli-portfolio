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
        `<p style="text-align: left; padding: 16px; margin: 0; line-height: 1.6;">
            Hey there! I’m a software engineer who loves turning coffee ☕ into code.<br><br>
            I've spent the last 3 years building web apps using .NET, NestJS, and PostgreSQL.<br>
            I'm obsessed with clean UIs, smooth UX, and making things intuitive and easy to use.<br><br>
            Outside of coding, you’ll find me sketching random ideas or gaming with friends (and internet strangers).
        </p>`,

    contact: () =>
        `<p style="text-align: left; padding: 16px; margin: 0; line-height: 1.6;">
            Got a project, idea, or just want to say hi? I'm all ears (and keyboards)!<br><br>
            📧 Email: <a href="mailto:manil.maharjan07@gmail.com">manil.maharjan07@gmail.com</a><br>
            💼 LinkedIn: <a href="https://www.linkedin.com/in/iammanil" target="_blank">linkedin.com/in/iammanil</a><br>
            📱 Phone: +977 9863777960
        </p>`,

    skills: () =>
    `<p style="text-align: left; padding: 16px; margin: 0; line-height: 1.6;">
        💻 <strong>Things I know my way around:</strong><br><br>
        🌐 <strong>Frontend:</strong> JavaScript/TypeScript, jQuery, Tailwind, HTML/CSS<br>
        🛠️ <strong>Backend:</strong> .NET, NestJS, PostgreSQL, SQL Server, REST APIs, Entity Framework, Dapper<br>
        🚀 <strong>DevOps & Tools:</strong> Azure DevOps, IIS, Git/GitHub
    </p>`,


    projects: () =>{
        const html = `<div style="padding: 16px; margin: 0; line-height: 1.6; text-align: left;">
                        <p>Here are some of the projects I've had the chance to work on:</p>

                        <div class="project-item" style="margin-bottom: 24px;">
                        <img src="images/remitx.png" alt="RemitX Screenshot" class="project-image" />
                        <div class="project-info" style="margin-top: 8px;">
                            <strong>RemitX</strong> – A white-label remittance solution.<br>
                            A scalable, browser-based system for financial institutions to handle cross-border transfers securely. 
                            Built on .NET and SQL Server, it also uses Azure Service Bus and Blob Storage. 
                            It has streamlined compliance and made transaction posting ultra-accurate.
                        </div>
                    </div>

                    <div class="project-item" style="margin-bottom: 24px;">
                        <img src="images/huku.png" alt="HUKU Screenshot" class="project-image" />
                        <div class="project-info" style="margin-top: 8px;">
                            <strong>HUKU</strong> – A slick real estate platform.<br>
                            Searchable listings, property uploads, image galleries, authentication, visit scheduling, and agent dashboards.
                            Built with Nunjucks, NestJS, and SQLite — everything a local property site needs.
                        </div>
                    </div>

                    <div class="project-item">
                        <img src="images/heifer.png" alt="Heifer PMIS Screenshot" class="project-image" />
                        <div class="project-info" style="margin-top: 8px;">
                            <strong>Heifer PMIS</strong> – Project management for NGOs.<br>
                            Built for Heifer International using .NET and PostgreSQL. 
                            It tracks projects, budgets, and stakeholders, and includes dashboards, alerts, and document uploads 
                            for smoother NGO operations.
                        </div>
                    </div>
                </div>`;
                setTimeout(scrollToBottom, 0);
            return html;
},

    clear: () => {
        output.innerHTML = "";
        return "";
    },

    cls: () => {
        output.innerHTML = "";
        return "";
    },
    // souvenir: async () => {
    //     try {
    //         const response = await fetch("images/souvenir.pdf");
    //         if (!response.ok) throw new Error("Network response was not ok");

    //         const blob = await response.blob();
    //         const url = URL.createObjectURL(blob);

    //         const link = document.createElement("a");
    //         link.href = url;
    //         link.download = "souvenir.pdf";
    //         document.body.appendChild(link);
    //         link.click();
    //         document.body.removeChild(link);

    //         URL.revokeObjectURL(url);

    //         return "Souvenir downloaded! Check your downloads folder.";
    //     } catch (error) {
    //         return `Failed to download souvenir: ${error.message}`;
    //     }
    // },

    exit:()=>{
        window.close();
    },
    history: () => `
<div style="text-align: left; padding: 16px; margin: 0; line-height: 1.6;">
    <h3 style="margin-bottom: 12px;">📜 Work History</h3>

    <div style="margin-bottom: 20px;">
        <strong>🧱 NET Developer – Inficare</strong><br>
        <em>Feb 2024 – Present</em><br>
        • Integrated Partner Send/Pull APIs to enable seamless communication between external systems.<br>
        • Upgraded system from .NET Framework 4.7.2 to .NET 8 using Clean Architecture, Repository Pattern, and Unit of Work.<br>
        • Enhanced admin panel to manage customer data more efficiently.<br>
        • Delivered key features based on requests from leadership, including the CEO.<br>
        <strong>Technologies:</strong> ASP.NET 4.7, 6, 8, SQL Server, Dapper, Azure DevOps, IIS
    </div>

    <div style="margin-bottom: 20px;">
        <strong>🏥 NET Developer – Team Next I.C.T Solutions</strong><br>
        <em>Apr 2022 – Feb 2024</em><br>
        • Lead dev for Heifer Cambodia’s PMER system: built, maintained, and demoed for clients.<br>
        • Conducted training, mentored juniors, and contributed to Heifer Nepal’s backend team.<br>
        • Worked on HRDC redesign, Heifer VCC, B&B Hospital’s CRM system, and Internal Review Committee tool.<br>
        • Strong foundation in ASP.NET MVC, QA, client interaction, and documentation.<br>
        <strong>Technologies:</strong> ASP.NET MVC, PostgreSQL, SQL Server, ReactJS, Git, Entity Framework, IIS
    </div>

    <div>
        <strong>🏠 NestJS Developer – HUKU (Freelance)</strong><br>
        <em>Jan 2025 – Aug 2025</em><br>
        • Built a full-featured real estate platform with listings, uploads, dashboards, and visit scheduling.<br>
        • Used NestJS for backend, Nunjucks for templating, and SQLite for storage.<br>
        • Gathered business requirements and delivered features aligned with goals.<br>
        <strong>Technologies:</strong> NestJS, Nunjucks, TypeORM, SQLite
    </div>
</div>
`,

};

const scrollToBottom = () => {
    const outputEl = document.getElementById("output");
    outputEl.scrollTo({ top: outputEl.scrollHeight, behavior: "smooth" });
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
