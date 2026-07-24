import Numworks from "upsilon.js";

const MAGIC = 0xEE0BDDBA;
const uint32Size = 4;
const nameSize = 16;
const flagSize = 1;

var calculator = new Numworks();
var is_connected = false;

let storage = [];

function calculator_connected(){
    console.log("Connected");
    is_connected = true;
    calculator.stopAutoConnect();
}

function getPadingForBufferSize(bufferSize){
    return (4 - (bufferSize % 4)) % 4;
}

async function getInternal(){
    if(is_connected){
        //read storage
        let pinfo = await calculator.getPlatformInfo();
        const startFlash = pinfo.external.flashStart + 327680;
        const endFlash = pinfo.external.flashEnd;
        const flashSize = endFlash - startFlash;

        console.log("Reading storage");

        let blobStorage = await calculator.__retrieveStorage(startFlash, flashSize, pinfo.version);
        
        console.log("Finding and cleaning files in storage")

        const storageArrayBuffer = await blobStorage.arrayBuffer();
        const dataView = new DataView(storageArrayBuffer);

        storage = [];

        let adress = startFlash;
        const minHeaderSize = uint32Size * 2 + nameSize + flagSize;

        while (adress + minHeaderSize < endFlash){
            let view_pos = adress - startFlash;

            if (view_pos + minHeaderSize > storageArrayBuffer.byteLength) {
                break;
            }

            let magic = dataView.getUint32(view_pos, true);
            let current_buffer_size = dataView.getUint32(view_pos + uint32Size, true);
            let flag = dataView.getUint8(view_pos + uint32Size * 2 + nameSize);

            if (magic != MAGIC){
                break;
            }

            if (flag != 0xFF){
                adress += uint32Size * 2 + nameSize + 4 + current_buffer_size + getPadingForBufferSize(current_buffer_size);
                continue;
            }

            if (adress + (uint32Size * 2) + nameSize + 4 + current_buffer_size 
                + getPadingForBufferSize(current_buffer_size) > endFlash) {
                break;
            }

            let nameBytes = new Uint8Array(storageArrayBuffer, view_pos + uint32Size * 2, nameSize);
            let fileName = new TextDecoder().decode(nameBytes).replace(/\0/g, '');

            console.log("Finding file : " + fileName);
            
            let contentOffset = view_pos + uint32Size * 2 + nameSize + 4;
            let actualSize = current_buffer_size;

            const firstByte = dataView.getUint8(contentOffset);
            if (firstByte === 0x01) {
                contentOffset += 1;
                actualSize -= 1;
            }

            if (actualSize > 0) {
                const lastByte = dataView.getUint8(contentOffset + actualSize - 1);
                if (lastByte === 0x00 || lastByte === 0xFF) {
                    actualSize -= 1;
                }
            }

            const fileBuffer = storageArrayBuffer.slice(contentOffset, contentOffset + actualSize);

            storage.push([fileName, new Blob([fileBuffer], { type: "text/plain" })]);

            adress += (uint32Size * 2) + nameSize + 4 + current_buffer_size + getPadingForBufferSize(current_buffer_size);
        }

        reloadInternalFileView();

    }else{
        alert("You need to connect your calculator !");

        calculator.detect(function() {
            calculator_connected();
        }, function(error) {
            alert("Error : " + error);
        });
    }
}

async function uploadInternal(){
    if(is_connected){
        if (storage.length == 0){
            alert("You need to load your files first !");
            return;
        }

        // get numworks infos
        let pinfo = await calculator.getPlatformInfo();
        const startFlash = pinfo.external.flashStart + 327680;
        const endFlash = pinfo.external.flashEnd;
        const flashSize = endFlash - startFlash;

        //make buffer
        console.log("Create buffer storage");

        const combinedBuffer = new Uint8Array(flashSize);
        combinedBuffer.fill(0xFF);

        const encoder = new TextEncoder();

        let position = 0;

        for (const data of storage) {
            const name = data[0];
            const blob = data[1];
            const buffer_size = (uint32Size * 2) + nameSize + 4;
            const buffer = new Uint8Array(buffer_size);
            buffer.fill(0xFF);

            const nameOffset = uint32Size * 2;
            buffer.subarray(nameOffset, nameOffset + nameSize).fill(0x00);

            const view = new DataView(buffer.buffer);

            view.setUint32(0, MAGIC, true);

            view.setUint32(uint32Size, blob.size, true);

            const encodedName = encoder.encode(name);
            buffer.set(encodedName.subarray(0, nameSize-1), uint32Size * 2);

            const arrayBuffer = await blob.arrayBuffer();
            const fileContent = new Uint8Array(arrayBuffer);

            combinedBuffer.set(buffer, position);
            combinedBuffer.set(fileContent, position + buffer_size);

            const padding = getPadingForBufferSize(blob.size);
            position += buffer_size + blob.size + padding;

        };

        //upload storage
        console.log("Upload buffer storage");

        try {
            await calculator.__flashStorage(startFlash, combinedBuffer.buffer, pinfo.version);
            console.log("Files installed successfully");
            alert("Files successfully synchronized !");
        } catch (err) {
            console.error("Flashing error:", err);
            alert("Error during synchronization: " + err.message);
        }

    }else{
        alert("You need to connect your calculator !");

        calculator.detect(function() {
            calculator_connected();
        }, function(error) {
            alert("Error : " + error);
        });
    }
}

function addingInternalFile(name, index){
    const files_list = document.getElementById("internal_files_list");

    const container = document.createElement("div");
    container.innerHTML = name;

    const download_btn = document.createElement("button");
    download_btn.innerHTML = "Download";
    download_btn.addEventListener("click", function(){
        const blob = storage[index][1];
        if (!blob){
            return;
        }
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
    }); //dowload file

    const delete_btn = document.createElement("button");
    delete_btn.innerHTML = "Delete";
    delete_btn.addEventListener("click", function(){
        storage.splice(index, 1);
        reloadInternalFileView();
    }); // delete file

    container.appendChild(download_btn);
    container.appendChild(delete_btn);
    container.appendChild(document.createElement("br"));
    container.appendChild(document.createElement("br"));

    files_list.appendChild(container);
}

function reloadInternalFileView(){
    //clear view
    let files_list = document.getElementById("internal_files_list");

    while(files_list.firstChild) { 
        files_list.removeChild(files_list.firstChild); 
    }

    // fill view
    storage.forEach(function(data, i) {
        addingInternalFile(data[0], i);
    })
}

function uploadFileInternal(e){
    let name = e.target.files[0].name;
    let blob = e.target.files[0];
    storage.push([name, blob]);

    reloadInternalFileView();
    e.target.value = "";
}

async function formatInternal(){
    if(is_connected){
        // get numworks infos
        let pinfo = await calculator.getPlatformInfo();
        const startFlash = pinfo.external.flashStart + 327680;
        const endFlash = pinfo.external.flashEnd;
        const flashSize = endFlash - startFlash;

        //make buffer
        console.log("Create buffer storage for format");

        const buffer = new Uint8Array(flashSize);
        buffer.fill(0xFF);

        //upload storage
        console.log("Upload buffer into storage");

        try {
            await calculator.__flashStorage(startFlash, buffer.buffer, pinfo.version);
            console.log("Format completed");
            alert("Format completed !");

            storage = [];
            reloadInternalFileView();
        } catch (err) {
            console.error("Flashing error:", err);
            alert("Error during synchronization: " + err.message);
        }

    }else{
        alert("You need to connect your calculator !");

        calculator.detect(function() {
            calculator_connected();
        }, function(error) {
            alert("Error : " + error);
        });
    }
}

calculator.autoConnect(calculator_connected);

document.getElementById("load_internal_files").addEventListener("click", getInternal);
document.getElementById("sync_internal_files").addEventListener("click", uploadInternal);
document.getElementById("format_internal").addEventListener("click", formatInternal);
document.getElementById("upload_internal").addEventListener("change", uploadFileInternal);