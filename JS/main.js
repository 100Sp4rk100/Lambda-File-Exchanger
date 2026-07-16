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

        const files = [
            { name: "a.a", content: "Contenu de mon fichier !" },
            { name: "b.b", content: "Deuxieme fichier ici !" },
            { name: "c.py", content: "print('Hello world de Lambda')" }
        ];

        let totalByteLength = 0;
        const processedFiles = files.map(f => {
            const nameBytes = encoder.encode(f.name);
            const bufferBytes = encoder.encode(f.content);
            const bufferSize = bufferBytes.length;

            const paddingBuffer = (4 - (bufferSize % 4)) % 4;
            
            const fileTotalLength = 4 + 4 + maxNameLength + 4 + bufferSize + paddingBuffer;
            
            totalByteLength += fileTotalLength;

            return {
                nameBytes,
                bufferBytes,
                bufferSize,
                paddingBuffer,
                fileTotalLength
            };
        });

        const buffer = new ArrayBuffer(totalByteLength);
        const view = new DataView(buffer);
        const uint8View = new Uint8Array(buffer);

        let offset = 0;

        for (const f of processedFiles) {
            view.setUint32(offset, 0xEE0BDDBA, true);

            view.setUint32(offset + 4, f.bufferSize, true);

            for (let i = 0; i < maxNameLength; i++) {
                uint8View[offset + 8 + i] = (i < f.nameBytes.length) ? f.nameBytes[i] : 0x00;
            }

            view.setUint32(offset + 8 + maxNameLength, 0x000000FF, true);

            uint8View.set(f.bufferBytes, offset + 8 + maxNameLength + 4);

            const padStart = offset + 8 + maxNameLength + 4 + f.bufferSize;
            for (let i = 0; i < f.paddingBuffer; i++) {
                uint8View[padStart + i] = 0x00;
            }

            offset += f.fileTotalLength;
        }

        let pinfo = await calculator.getPlatformInfo();
        const startFlash = pinfo.external.flashStart + 327680;

        const dataToSend = new Uint8Array(buffer);
        
        await calculator.__flashStorage(startFlash, dataToSend.buffer, pinfo.version);

    } else {
        calculator.detect(function() {
            calculator_connected();
        }, function(error) {
            alert("Error : " + error);
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

        const totalSizeToErase = 832 * 1024; // 1 Mo
        let currentOffset = 0;

        while (currentOffset < totalSizeToErase) {
            let targetAddress = startFlash + currentOffset;
            
            await calculator.__flashStorage(targetAddress, eraseView.buffer, pinfo.version);
            currentOffset += chunkSize;
        }

    } else {
        calculator.detect(function() {
            calculator_connected();
        }, function(error) {
            console.error("Erreur de connexion :", error);
            alert("Erreur : " + error);
        });
    }
});