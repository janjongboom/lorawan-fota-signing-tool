# LoRaWAN Firmware Update signing tools

This repository contains a tool to generate public/private key pairs and sign updates that can be used with [mbed-lorawan-update-client](https://github.com/janjongboom/mbed-lorawan-update-client). In addition it can also create fragmented data blocks according to the LoRa Alliance Fragmentated Data Block Transfer specification.

## To install

1. Install OpenSSL (have `openssl` in your PATH).
1. Install Python 2.7 (have `python` in your PATH) (if you need to generate fragmentation packets).
1. Install Node.js 8 or higher.
1. Install the signing tools:

    ```
    $ npm install lorawan-fota-signing-tool -g
    ```

## Generating keypair

You need to generate an elliptic curve key pair. The public key of the certificate is loaded into the device, the private key is used to sign firmware updates. The private key should **never** be shared. Keep it on an air-gapped computer. In addition this creates a vendor and device class UUID, which are used to verify that a firmware update was actually meant for a device (extra line of defense).

```
$ lorawan-fota-signing-tool create-keypair -d yourdomain.com -m your-device-model-string
```

This generates four files:

* `.fota-keys/update.key` - private key.
* `.fota-keys/update.pub` - public key.
* `.fota-keys/device-ids.json` - vendor and device class UUID.
* `UpdateCerts.h` - public key, vendor UUID and device class UUID, as C header file. To be included in your firmware.

## Signing an update

To create a file that can be used for a firmware update you need to sign it. This will sign the SHA256 hash of the firmware with the private key, and add vendor and device class UUID information. The output of this process is a single file containing the binary, plus the manifest containing the signed hash.

To sign an update:

```
$ lorawan-fota-signing-tool sign-binary -b examples/xdot-blinky-v1.bin -o xdot-blinky-v1-signed.bin --output-format bin
```

The output format can be:

* `bin` (default) - generates a binary file.
* `packets-plain` - generates fragmentation packets in plain text (see [Fragmentation packets](#fragmentation-packets)).
* `packets-h` - generates fragmentation packets as C header (see [Fragmentation packets](#fragmentation-packets)).

You can also set:

* `--override-version` - by default the version of the update is the modified date of the binary. For testing purposes you might want to override this (to flash older binaries). This sets the version to the current date.

## Signing a delta update

You can also create a delta update, and sign it in one command. This uses [jdiff](https://github.com/janjongboom/jdiff-js) to create the diff, and is the diff protocol that mbed-lorawan-update-client uses.

To sign the delta update:

```
$ lorawan-fota-signing-tool sign-delta --old examples/xdot-blinky-v1.bin --new examples/xdot-blinky-v2.bin --output-format bin -o signed-diff.bin
```

## Fragmentation packets

You can create fragmentation blocks based on the LoRa Alliance Fragmentated Data Block Transfer specification. This contains redundancy frames to recover lost packets. You can create this as standalone command, or directly from the `sign-binary` and `sign-delta` commands.

To create fragmentation packets:

```
$ lorawan-fota-signing-tool create-frag-packets -i signed-binary.bin --output-format plain --frag-size 204 --redundancy-packets 5 -o packets.txt
```

Output format needs to be either:

* `plain` - Creates a plain text file, one packet per line.
* `h` - Creates a C header file.

## License

* `encoded_file.py` is copyrighted by Semtech.

The rest of this repository is Apache 2.0 licensed.
