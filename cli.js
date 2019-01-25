#!/usr/bin/env node

const program = require('commander');
const UUID = require('uuid-1345');
const fs = require('fs');
const Path = require('path');
const spawnSync = require('child_process').spawnSync;
const version = JSON.parse(fs.readFileSync(Path.join(__dirname, 'package.json'), 'utf-8')).version;
const os = require('os');

const certsFolder = Path.join(process.cwd(), '.fota-keys');

const commands = {
    'create-keypair': createKeypair,
    'sign-binary': signBinary,
    'sign-delta': signDelta,
    'create-frag-packets': createFragPackets
};

let cmd = process.argv[2];
if (typeof commands[cmd] === 'function') {
    return commands[cmd]();
}
else {
    if (cmd) {
        console.log('Unknown command', cmd);
        console.log('');
    }
    console.log('Valid commands are:')
    for (let j of Object.keys(commands)) {
        console.log(`\t${j}`);
    }
}

function createKeypair() {
    program
        .version(version)
        .option('-d --domain-name <domain>', 'Your domain (f.e. example.com)')
        .option('-m --model <model>', 'Device model (f.e. awesome-2000)')
        .allowUnknownOption(false)
        .parse(process.argv);

    if (!program.domainName) {
        console.log('--domain-name is required\n');
        program.help();
    }

    if (!program.model) {
        console.log('--model is required\n');
        program.help();
    }

    if (fs.existsSync(certsFolder)) {
        console.log(certsFolder, `folder already exists, refusing to overwrite existing certificates`);
        process.exit(1);
    }
    fs.mkdirSync(certsFolder);

    console.log('Creating keypair');

    let genKey = spawnSync('openssl', [
        'ecparam', '-genkey', '-name', 'secp256r1', '-out', Path.join(certsFolder, 'update.key')
    ]);
    if (genKey.status !== 0) {
        console.log('Generating keypair failed', genKey.status);
        console.log(genKey.stdout.toString('utf-8'));
        console.log(genKey.stderr.toString('utf-8'));
        process.exit(1);
    }

    let extractPub = spawnSync('openssl', [
        'ec', '-in', Path.join(certsFolder, 'update.key'), '-pubout'
    ]);
    if (extractPub.status !== 0) {
        console.log('Extracting public key failed', extractPub.status);
        console.log(extractPub.stdout.toString('utf-8'));
        console.log(extractPub.stderr.toString('utf-8'));
        process.exit(1);
    }

    let pubKey = extractPub.stdout;

    fs.writeFileSync(Path.join(certsFolder, 'update.pub'), pubKey);

    console.log('Creating keypair OK');

    let deviceIds = {
        'manufacturer-uuid': UUID.v5({
            namespace: UUID.namespace.url,
            name: program.domainName
        }),
        'device-class-uuid': UUID.v5({
            namespace: UUID.namespace.url,
            name: program.model
        })
    };

    fs.writeFileSync(Path.join(certsFolder, 'device-ids.json'), JSON.stringify(deviceIds, null, 4), 'utf-8');

    console.log('Wrote device-ids.json OK');

    // now create the .H file...
    let manufacturerUUID = new UUID(deviceIds['manufacturer-uuid']).toBuffer();
    let deviceClassUUID = new UUID(deviceIds['device-class-uuid']).toBuffer();

    let certs = `#ifndef _UPDATE_CERTS_H
#define _UPDATE_CERTS_H

const char * UPDATE_CERT_PUBKEY = ${JSON.stringify(pubKey.toString('utf-8'))};
const size_t UPDATE_CERT_LENGTH = ${pubKey.length + 1};

const uint8_t UPDATE_CERT_MANUFACTURER_UUID[16] = { ${Array.from(manufacturerUUID).map(c => '0x' + c.toString(16)).join(', ')} };
const uint8_t UPDATE_CERT_DEVICE_CLASS_UUID[16] = { ${Array.from(deviceClassUUID).map(c => '0x' + c.toString(16)).join(', ')} };

#endif // _UPDATE_CERTS_H_
`;

    console.log('Writing UpdateCerts.h');
    fs.writeFileSync(Path.join(process.cwd(), 'UpdateCerts.h'), certs, 'utf-8');
    console.log('Writing UpdateCerts.h OK');
}

function signBinary() {
    program
        .version(version)
        .option('-b --binary <file>', 'Binary to sign')
        .option('-f --output-format <format>', 'Output format: bin (default), packets-plain, packets-h')
        .option('-o --out-file <file>', 'Output file')
        .option('--frag-size <number>', 'Fragmentation size (only when output-format is set to packets-*)')
        .option('--redundancy-packets <number>', 'Number of redundancy packets (only when output-format is set to packets-*)')
        .option('--override-version', 'Use now as version, instead of date the binary was created')
        .allowUnknownOption(false)
        .parse(process.argv);

    if (!program.binary) {
        console.log('--binary is required\n');
        program.help();
    }

    if (!program.outFile) {
        console.log('--outFile is required\n');
        program.help();
    }

    if (program.outputFormat && ['bin', 'packets-plain', 'packets-h'].indexOf(program.outputFormat) === -1) {
        console.log('Unknown value for --output-format', program.outputFormat);
        program.help();
    }

    if (!program.outputFormat) {
        program.outputFormat = 'bin';
    }

    // this is not diff!
    let isDiffBuffer = Buffer.from([ 0, 0, 0, 0 ]);

    let manifest = _createManifest(program.binary, program.overrideVersion, isDiffBuffer);

    let outFile = Buffer.concat([
        fs.readFileSync(program.binary),
        manifest
    ]);

    switch (program.outputFormat) {
        case 'bin': {
            fs.writeFileSync(program.outFile, outFile);
            console.log('Written to', program.outFile);
            break;
        }

        case 'packets-plain': {
            return _packets_plain(program, outFile, program.outFile);
        }

        case 'packets-h': {
            return _packets_h(program, outFile, program.outFile);
        }
    }
}

function signDelta() {
    program
        .version(version)
        .option('--old <file>', 'Old binary to generate diff from')
        .option('--new <file>', 'New binary to generate diff from')
        .option('-f --output-format <format>', 'Output format: bin (default), packets-plain, packets-h')
        .option('-o --out-file <file>', 'Output file')
        .option('--frag-size <number>', 'Fragmentation size (only when output-format is set to packets-*)')
        .option('--redundancy-packets <number>', 'Number of redundancy packets (only when output-format is set to packets-*)')
        .option('--override-version', 'Use now as version, instead of date the binary was created')
        .allowUnknownOption(false)
        .parse(process.argv);

    if (!program.old) {
        console.log('--old is required\n');
        program.help();
    }

    if (!program.new) {
        console.log('--new is required\n');
        program.help();
    }

    if (!program.outFile) {
        console.log('--outFile is required\n');
        program.help();
    }

    if (program.outputFormat && ['bin', 'packets-plain', 'packets-h'].indexOf(program.outputFormat) === -1) {
        console.log('Unknown value for --output-format', program.outputFormat);
        program.help();
    }

    if (!program.outputFormat) {
        program.outputFormat = 'bin';
    }

    // create the diff between these binaries...
    let tempFile = Path.join(process.cwd(), Date.now() + '.diff');
    let diffCmd = spawnSync('node', [
        Path.join(__dirname, 'node_modules', 'jdiff-js', 'jdiff.js'),
        program.old,
        program.new,
        tempFile
    ]);
    if (diffCmd.status !== 0) {
        console.log('Creating diff failed', diffCmd.status);

        console.log(diffCmd.stdout.toString('utf-8'));
        console.log(diffCmd.stderr.toString('utf-8'));
        try {
            fs.unlinkSync(tempFile);
        }
        catch (ex) {}

        if (diffCmd.status === 5) {
            console.log('This seems like a permission error. Do you have permission to write to',
                process.cwd(), '?');
        }

        process.exit(1);
    }

    let diff = fs.readFileSync(tempFile);

    fs.unlinkSync(tempFile);

    // this is diff
    let oldFileLength = require('fs').readFileSync(program.old).length;

    let isDiffBuffer = Buffer.from([ 1, (oldFileLength >> 16) & 0xff, (oldFileLength >> 8) & 0xff, oldFileLength & 0xff ]);

    console.log('diff buffer', isDiffBuffer);

    let manifest = _createManifest(program.new, program.overrideVersion, isDiffBuffer);

    let outFile = Buffer.concat([
        diff,
        manifest
    ]);

    switch (program.outputFormat) {
        case 'bin': {
            fs.writeFileSync(program.outFile, outFile);
            console.log('Written to', program.outFile);
            break;
        }

        case 'packets-plain': {
            return _packets_plain(program, outFile, program.outFile);
        }

        case 'packets-h': {
            return _packets_h(program, outFile, program.outFile);
        }
    }
}

function _createManifest(file, overrideVersion, isDiffBuffer) {
    let signature = _sign(file);
    let sigLength = Buffer.from([ signature.length ]);

    // always round up to 72 bytes
    if (signature.length === 70) {
        signature = Buffer.concat([ signature, Buffer.from([ 0, 0 ]) ]);
    }
    else if (signature.length === 71) {
        signature = Buffer.concat([ signature, Buffer.from([ 0 ]) ]);
    }

    let binVersion;
    if (overrideVersion) {
        console.log('Version is', Date.now() / 1000 | 0, '(overriden)');
        binVersion = Date.now() / 1000 | 0;
    }
    else {
        binVersion = fs.statSync(file).mtime.getTime() / 1000 | 0;
        console.log('Version is', binVersion);
    }

    let versionBuffer = Buffer.from([ binVersion & 0xff, (binVersion >> 8) & 0xff, (binVersion >> 16) & 0xff, (binVersion >> 24) & 0xff ]);
    let deviceId = JSON.parse(fs.readFileSync(Path.join(certsFolder, 'device-ids.json'), 'utf-8'));
    let manufacturerUUID = new UUID(deviceId['manufacturer-uuid']).toBuffer();
    let deviceClassUUID = new UUID(deviceId['device-class-uuid']).toBuffer();

    let manifest = Buffer.concat([ sigLength, signature, manufacturerUUID, deviceClassUUID, versionBuffer, isDiffBuffer ]);
    return manifest;
}

function _sign(file) {
    if (!fs.existsSync(certsFolder)) {
        console.log(certsFolder, `folder does not exist, run 'lorawan-fota-signing-tool create-keypair' first`);
        process.exit(1);
    }

    if (!fs.existsSync(file)) {
        console.log(file, 'does not exist');
        process.exit(1);
    }

    let signature = spawnSync('openssl', [
        'dgst', '-sha256', '-sign', Path.join(certsFolder, 'update.key'), file
    ]);
    if (signature.status !== 0) {
        console.log('Signing binary failed', signature.status);
        console.log(signature.stdout.toString('utf-8'));
        console.log(signature.stderr.toString('utf-8'));
        process.exit(1);
    }

    let sig = signature.stdout;

    console.log('Signed signature is', sig.toString('hex'));

    return sig;
}

function _packets_plain(program, bin, outFile) {
    let [ header, fragments ] = _create_packets(program, bin);

    let packets = [ header ].concat(fragments);

    let data = packets.map(p => {
        return p.map(b => {
            let s = b.toString(16);
            if (s.length === 1) s = '0' + s;
            return s;
        }).join(' ')
    }).join('\n');

    fs.writeFileSync(outFile, data, 'utf-8');
    console.log('Written to', outFile);
}

function _packets_h(program, bin, outFile) {
    let [ header, fragments ] = _create_packets(program, bin);
let packetsData = `#ifndef PACKETS_H
#define PACKETS_H

#include "mbed.h"

const uint8_t FAKE_PACKETS_HEADER[] = { ${header.map(n => '0x' + n.toString(16)).join(', ')} };

const uint8_t FAKE_PACKETS[][${fragments[0].length}] = {
`;

for (let f of fragments) {
    packetsData += '    { ' + f.map(c => '0x' + c.toString(16)).join(', ') + ' },\n';
}
packetsData += `};

#endif
`;

    fs.writeFileSync(outFile, packetsData, 'utf-8');
    console.log('Written to', outFile);
}

function _create_packets(program, bin) {
    // outFile
    if (typeof program.redundancyPackets === 'undefined') {
        console.log('\n--redundancy-packets required\n');
        program.help();
    }

    if (typeof program.fragSize === 'undefined') {
        console.log('\n--frag-size required\n');
        program.help();
    }

    // store somewhere in temp
    let tempFile = Path.join(os.tmpdir(), Date.now() + '.bin');
    fs.writeFileSync(tempFile, bin);

    const infileP = spawnSync('python', [
        Path.join(__dirname, 'encode_file.py'),
        tempFile,
        program.fragSize,
        program.redundancyPackets
    ]);
    if (infileP.status !== 0) {
        console.log('Encoding packet failed', infileP.status);
        console.log(infileP.stdout.toString('utf-8'));
        console.log(infileP.stderr.toString('utf-8'));
        process.exit(1);
    }

    let infile = infileP.stdout.toString('utf-8').split('\n');
    let header;
    let fragments = [];

    for (let line of infile) {
        if (line.indexOf('Fragmentation header likely') === 0) {
            header = line.replace('Fragmentation header likely: ', '').match(/\b0x(\w\w)\b/g).map(n => parseInt(n));
        }

        else if (line.indexOf('[8, ') === 0) {
            fragments.push(line.replace('[', '').replace(']', '').split(',').map(n => Number(n)));
        }
    }

    // set padding
    let sz = fs.statSync(tempFile).size;
    if (sz % program.fragSize === 0) {
        header[6] = 0;
    }
    else {
        header[6] = program.fragSize - (sz % program.fragSize);
    }

    // also fragment header is wrong...
    for (let f of fragments) {
        [f[1], f[2]] = [f[2], f[1]];
    }

    fs.unlinkSync(tempFile);

    return [ header, fragments ];
}

function createFragPackets() {
    program
        .version(version)
        .option('-i --in-file <file>', 'Input file')
        .option('-f --output-format <format>', 'Output format: plain | h')
        .option('-o --out-file <file>', 'Output file')
        .option('--frag-size <number>', 'Fragmentation size (only when output-format is set to packets-*)')
        .option('--redundancy-packets <number>', 'Number of redundancy packets (only when output-format is set to packets-*)')
        .option('--override-version', 'Use now as version, instead of date the binary was created')
        .allowUnknownOption(false)
        .parse(process.argv);

    if (!program.inFile) {
        console.log('--in-file is required\n');
        program.help();
    }

    switch (program.outputFormat) {
        case 'plain':
            return _packets_plain(program, fs.readFileSync(program.inFile), program.outFile);

        case 'h':
            return _packets_h(program, fs.readFileSync(program.inFile), program.outFile);

        default:
            console.log(`--output-format should be 'plain' or 'h', not'`, program.outputFormat, '\n');
            program.help();
    }
}
