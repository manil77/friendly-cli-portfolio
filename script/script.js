const terminalOutput = document.querySelector(".terminal-output");
const bootLines = [
    "booting immersive.dev.sys...",
    "loading modules: C#, .NET, JavaScript, RDBMS",
    "connecting to terminal...",
    "initializing CLI interface...",
    "Welcome to cli-portfolio!",
    "Type 'view work', 'about', or 'contact' and press [Enter] to continue.",
];
bootLines.forEach((line, index) => {
    setTimeout(() => {
        terminalOutput.innerHTML += `<div class="terminal-line">${line}</div>`;
    }, index * 500); // 1 second delay between each line
});

const terminalInput = document.querySelector("#terminalInput");

terminalInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        const input = terminalInput.value.trim();
        if (input) {
            terminalOutput.innerHTML += `<div class="terminal-line">> ${input}</div>`;
            handleCommand(input);
            terminalInput.value = ""; // Clear input after command
        }
    }
});
function handleCommand(command) {
    axios
        .post("/api/command", {
            command: command,
        })
        .then((response) => {
            // If server sends plain text
            terminalOutput.innerHTML += `<div class="terminal-line">${response.data}</div>`;

            // If server sends JSON, use: response.data.message or similar
        })
        .catch((error) => {
            console.error("Error:", error);
            terminalOutput.innerHTML += `<div class="terminal-line">An error occurred. Please try again.</div>`;
        });
}
