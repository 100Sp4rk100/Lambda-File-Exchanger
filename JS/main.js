import Numworks from "upsilon.js";

const MAGIC = 0xEE0BDDBA;
const uint32Size = 4;
const nameSize = 16;
const flagSize = 1;

var calculator = new Numworks();
var is_connected = false;

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
        //clear view
        let files_list = document.getElementById("internal_files_list");

        while(files_list.firstChild) { 
            files_list.removeChild(files_list.firstChild); 
        }

        //read storage
        let pinfo = await calculator.getPlatformInfo();
        const startFlash = pinfo.external.flashStart + 327680;
        const endFlash = pinfo.external.flashEnd;
        const flashSize = endFlash - startFlash;

        console.log("Reading storage")

        let blobStorage = await calculator.__retrieveStorage(startFlash, flashSize, pinfo.version);
        
        console.log("Finding and cleaning files in storage")

        const storageArrayBuffer = await blobStorage.arrayBuffer();
        const dataView = new DataView(storageArrayBuffer);

        let storage = {};

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
            addingInternalFile(fileName);

            adress += (uint32Size * 2) + nameSize + 4 + current_buffer_size + getPadingForBufferSize(current_buffer_size);
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

function addingInternalFile(name){
    const files_list = document.getElementById("internal_files_list");

    const container = document.createElement("div");
    container.innerHTML = name;

    const download_btn = document.createElement("button");
    download_btn.innerHTML = "Download";
    download_btn.addEventListener("click", function(){}); //dowload file

    const delete_btn = document.createElement("button");
    delete_btn.innerHTML = "Delete";
    delete_btn.addEventListener("click", function(){}); // delete file

    container.appendChild(download_btn);
    container.appendChild(delete_btn);

    files_list.appendChild(container);
}

calculator.autoConnect(calculator_connected);

document.getElementById("load_internal_files").addEventListener("click", getInternal);