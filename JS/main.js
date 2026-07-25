import Numworks from "upsilon.js";

const MAGIC = 0xEE0BDDBA;
const uint32Size = 4;
const nameSize = 16;
const flagSize = 1;

var calculator = new Numworks();
var is_connected = false;

let internalStorage = [];
let externalStorage = [];

let totalSize = 0;

const originalLog = console.log;

function log_function(...args){
    originalLog.apply(console, args);

    const message = args.map(arg => {
        try {
            return typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg);
        } catch {
            return String(arg);
        }
    }).join(" ");

    const consoleDiv = document.getElementById("console");
    if (consoleDiv) {
        const line = document.createElement("div");
        line.textContent = message;
        consoleDiv.appendChild(line);
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }
}

async function calculator_connected(){
    console.log("Connected");
    is_connected = true;
    calculator.stopAutoConnect();
    
    await getExternal();
    //await getInternal();
}

// INTERNAL FUNCTIONS
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

        console.log("Reading internal storage");

        let blobStorage = await calculator.__retrieveStorage(startFlash, flashSize, pinfo.version);
        
        console.log("Finding and cleaning files in storage")

        const storageArrayBuffer = await blobStorage.arrayBuffer();
        const dataView = new DataView(storageArrayBuffer);

        internalStorage = [];

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

            internalStorage.push([fileName, new Blob([fileBuffer], { type: "text/plain" })]);

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
        if (internalStorage.length == 0){
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

        for (const data of internalStorage) {
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
        const blob = internalStorage[index][1];
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
        internalStorage.splice(index, 1);
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
    internalStorage.forEach(function(data, i) {
        addingInternalFile(data[0], i);
    })
}

function uploadFileInternal(e){
    let name = e.target.files[0].name;
    let blob = e.target.files[0];
    internalStorage.push([name, blob]);

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

            internalStorage = [];
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

// EXTERNAL FUNCTIONS
async function getExternal(){
    if(is_connected){
        //read storage
        console.log("Reading external storage");

        let pinfo = await calculator.getPlatformInfo();
        totalSize = pinfo["storage"]["size"];

        externalStorage = await calculator.backupStorage();

        for (var i in externalStorage.records) {
            var record = externalStorage.records[i];
            var name = record.name + "." + record.type;

            console.log("Finding file : " + name);
        }

        reloadExternalFileView();

    }else{
        alert("You need to connect your calculator !");

        calculator.detect(function() {
            calculator_connected();
        }, function(error) {
            alert("Error : " + error);
        });
    }
}

async function uploadExternal(){
    if(is_connected){
        if (externalStorage.length == 0){
            alert("You need to load your files first !");
            return;
        }

        //upload storage
        console.log("Upload storage");

        await calculator.installStorage(externalStorage, function() {
            console.log("Files installed successfully");
            alert("Files successfully synchronized !");
        });

    }else{
        alert("You need to connect your calculator !");

        calculator.detect(function() {
            calculator_connected();
        }, function(error) {
            alert("Error : " + error);
        });
    }
}

function addingExternalFile(name){
    const files_list = document.getElementById("external_files_list");

    const container = document.createElement("div");
    container.innerHTML = name;

    const download_btn = document.createElement("button");
    download_btn.innerHTML = "Download";
    download_btn.addEventListener("click", function(){
        for (var i in externalStorage.records) {
            var record = externalStorage.records[i];
            var record_name = record.name + "." + record.type;

            if (record_name == name){
                const blob = record.data;

                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = name;
                a.click();
                URL.revokeObjectURL(url);

                return;
            }
        }
    }); //dowload file

    const delete_btn = document.createElement("button");
    delete_btn.innerHTML = "Delete";
    delete_btn.addEventListener("click", async function(){
        for (var i in externalStorage.records) {
            var record = externalStorage.records[i];
            var record_name = record.name + "." + record.type;

            if (record_name == name){
                externalStorage.records.splice(i, 1);

                await uploadExternal();

                reloadExternalFileView();
                return;
            }
        }
    }); // delete file

    container.appendChild(download_btn);
    container.appendChild(delete_btn);
    container.appendChild(document.createElement("br"));
    container.appendChild(document.createElement("br"));

    files_list.appendChild(container);
}

function reloadExternalFileView(){
    //clear view
    let files_list = document.getElementById("external_files_list");

    while(files_list.firstChild) { 
        files_list.removeChild(files_list.firstChild); 
    }

    let size = 0;

    // fill view
    for (var i in externalStorage.records) {
        var record = externalStorage.records[i];
        var record_name = record.name + "." + record.type;

        if (record.type == "py") {
          size += record.code.length;
          size += record.name.length + 1 + record.type.length;

          // 8 bits header + 16 bits size + \0 name + \0 content
          size += 1 + 2 + 1 + 1;
        } else {
          size += record.data.size;
          size += record.name.length + 1 + record.type.length;
          // 8 bits header + 16 bits size + \0 name
          size += 1 + 2 + 1;
        }

        addingExternalFile(record_name);
    }

    const bar = document.getElementById("externalBar");
    bar.style.width = Math.round((size / totalSize) * 100) + "%";
}

async function uploadFileExternal(e){
    let name = e.target.files[0].name;
    let blob = e.target.files[0];

    let lastDotIndex = name.lastIndexOf(".");
    
    let name_without_extension = lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;
    let extension = lastDotIndex !== -1 ? name.substring(lastDotIndex + 1) : "";

    let newRecord = {
        "name": name_without_extension, 
        "type": extension, 
        "autoImport": false
    };

    if (extension.toLowerCase() === "py") {
        newRecord.code = await blob.text();
    } else {
        //let arrayBuffer = await blob.arrayBuffer();
        newRecord.data = blob;
    }

    externalStorage.records.push(newRecord);

    await uploadExternal();

    reloadExternalFileView();
    e.target.value = "";
}

async function formatExternal(){
    if(is_connected){
        if (externalStorage.length == 0){
            alert("You need to load your files first !");
            return;
        }

        externalStorage.records = externalStorage.records.filter(record => {
            var record_name = record.name + (record.type ? "." + record.type : "");
            return record_name === "pr.sys" || record_name === "gp.sys";
        });

        //upload storage
        console.log("Format storage");

        await calculator.installStorage(externalStorage, function() {
            console.log("Format completed");
            alert("Format completed !");

            reloadExternalFileView();
        });

    }else{
        alert("You need to connect your calculator !");

        calculator.detect(function() {
            calculator_connected();
        }, function(error) {
            alert("Error : " + error);
        });
    }
}

console.log = log_function;

calculator.autoConnect(calculator_connected);

navigator.usb.addEventListener("disconnect", function(e) {
  calculator.onUnexpectedDisconnect(e, function() {
    is_connected = false;
    internalStorage = [];
    externalStorage = [];
    reloadInternalFileView();
    reloadExternalFileView();
    calculator.autoConnect(calculator_connected);
  });
});

document.getElementById("format_external").addEventListener("click", formatExternal);
document.getElementById("upload_external").addEventListener("change", uploadFileExternal);

document.getElementById("sync_internal_files").addEventListener("click", uploadInternal);
document.getElementById("format_internal").addEventListener("click", formatInternal);
document.getElementById("upload_internal").addEventListener("change", uploadFileInternal);