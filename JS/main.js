import Numworks from "upsilon.js";


var calculator = new Numworks();
var is_connected = false;

function calculator_connected(){
    console.log("Connected");
    is_connected = true;
    calculator.stopAutoConnect();
}

calculator.autoConnect(calculator_connected);

document.getElementById("a").addEventListener("click", async function (e){
    if (is_connected){
        const encoder = new TextEncoder();
        const maxNameLength = 16;

        const filename1 = "a.a";
        const fileContent1 = "Contenu de mon fichier !";
        const nameBytes1 = encoder.encode(filename1);
        const bufferBytes1 = encoder.encode(fileContent1);
        const bufferSize1 = bufferBytes1.length;
        const file1TotalLength = 4 + 4 + maxNameLength + bufferSize1;

        const filename2 = "b.b";
        const fileContent2 = "Deuxieme fichier ici !";
        const nameBytes2 = encoder.encode(filename2);
        const bufferBytes2 = encoder.encode(fileContent2);
        const bufferSize2 = bufferBytes2.length;
        const file2TotalLength = 4 + 4 + maxNameLength + bufferSize2;

        const totalByteLength = file1TotalLength + file2TotalLength;

        const buffer = new ArrayBuffer(totalByteLength);
        const view = new DataView(buffer);
        const uint8View = new Uint8Array(buffer);

        let offset = 0;

        view.setUint32(offset, 0xEE0BDDBA, true);

        view.setUint32(offset + 4, bufferSize1, true);

        for (let i = 0; i < maxNameLength; i++) {
            uint8View[offset + 8 + i] = (i < nameBytes1.length) ? nameBytes1[i] : 0;
        }

        uint8View.set(bufferBytes1, offset + 8 + maxNameLength);

        offset = file1TotalLength;


        view.setUint32(offset, 0xEE0BDDBA, true);

        view.setUint32(offset + 4, bufferSize2, true);

        for (let i = 0; i < maxNameLength; i++) {
            uint8View[offset + 8 + i] = (i < nameBytes2.length) ? nameBytes2[i] : 0;
        }

        uint8View.set(bufferBytes2, offset + 8 + maxNameLength);

        let pinfo = await calculator.getPlatformInfo();
        const startFlash = pinfo.external.flashStart + 327680;

        const dataToSend = new Uint8Array(buffer);

        console.log("startFlash :", startFlash);
        console.log(`Écriture de 2 fichiers (${totalByteLength} octets) en cours...`);

        await calculator.__flashStorage(startFlash, dataToSend.buffer, pinfo.version);

        console.log("Flash terminé !");
    } else {
        calculator.detect(function() {
            calculator_connected();
        }, function(error) {
            console.error("Erreur de connexion :", error);
            alert("Erreur : " + error);
        });
    }
});

document.getElementById("b").addEventListener("click", async function (e){
    if (is_connected){
        console.log("bbb")

        let pinfo = await calculator.getPlatformInfo();
        const startFlash = pinfo.external.flashStart + 327680;

        const chunkSize = 64 * 1024; 
        const eraseBuffer = new ArrayBuffer(chunkSize);
        const eraseView = new Uint8Array(eraseBuffer);
        eraseView.fill(0x00);

        const totalSizeToErase = 1024 * 1024; // 1 Mo
        let currentOffset = 0;

        console.log("Démarrage du nettoyage de la zone complète...");

        while (currentOffset < totalSizeToErase) {
            let targetAddress = startFlash + currentOffset;
            console.log(`Écriture de zéros à l'adresse : ${targetAddress} (${(currentOffset / 1024).toFixed(0)} ko / 1024 ko)`);
            
            await calculator.__flashStorage(targetAddress, eraseView.buffer, pinfo.version);
            currentOffset += chunkSize;
        }

        console.log("Secteur de 64 ko entièrement nettoyé avec succès !");

    } else {
        calculator.detect(function() {
            calculator_connected();
        }, function(error) {
            console.error("Erreur de connexion :", error);
            alert("Erreur : " + error);
        });
    }
});