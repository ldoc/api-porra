import { Octokit } from "octokit";

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

async function guardarFichero(ruta, datos, message) {
    // 1. Intentar obtener el SHA si el archivo ya existe
    const owner = "ldoc";
    const repo = "api-porra";
    const path = ruta;
    const branch = "master";
    let currentSha = null;
    try {
        const fileData = await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
            ref: branch // Buscamos en la rama correcta
        });

        // Si encuentra el archivo, guardamos su SHA
        currentSha = fileData.data.sha;
    } catch (error) {
        // Si devuelve 404 significa que el archivo es nuevo, ignoramos el error
        if (error.status !== 404) {
            throw error;
        }
    }
    try {
        // El contenido debe estar en formato base64
        const contenidoTexto = datos;
        const content = Buffer.from(contenidoTexto).toString("base64");

        const response = await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message,
            content,
            branch, // o la rama que uses por defecto
            sha: currentSha
        });

        console.log("¡Fichero guardado con éxito!", response.data.content.path);
    } catch (error) {
        console.error("Error al guardar el fichero:", error);
    }
}

export { guardarFichero };

//guardarFichero("data/pruebafunciones.txt", "hola");