// Serial monitor for the OnePage reader, built on raw Web Serial (no esptool).
// Complements the flasher: it shows the device's boot / runtime log so you can
// actually verify a flash succeeded (ESP boot header, then our LOG_INF lines).
//
// esptool-js's Transport.disconnect() performs a full device.close(), and the
// port permission granted by requestPort() stays on the SerialPort object — so
// right after a flash we can reopen the SAME port without another picker gesture.
// If the chip re-enumerates its USB interface across the reboot, open() may
// briefly fail; we retry for a few seconds before giving up.

export interface MonitorOpts {
  /** Reuse an already-granted port (e.g. the one the flasher just released). */
  port?: SerialPort;
  onData: (text: string) => void;
  onLog: (msg: string) => void;
  /** Called when the device disappears mid-session (unplug / USB reset). */
  onClose: () => void;
}

export class SerialMonitor {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private running = false;

  /** Open the serial stream and start pumping decoded text into onData. */
  async start(opts: MonitorOpts): Promise<void> {
    if (this.running) return;
    if (!('serial' in navigator)) throw new Error('Web Serial unavailable');

    // Without a port handed over from the flasher, prompt the picker (needs a
    // user gesture — only reachable from the manual button).
    let port = opts.port ?? null;
    if (!port) {
      port = await navigator.serial.requestPort();
    }
    this.port = port;

    // Device may still be re-enumerating after the post-flash reboot (~3s window).
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        // 115200 is ignored by USB-Serial/JTAG (CDC carries no baud signalling)
        // but must match the firmware UART baud for DTR/RTS-board variants.
        await port.open({ baudRate: 115200 });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    if (lastErr) {
      this.port = null;
      throw lastErr instanceof Error ? lastErr : new Error('Could not open serial port');
    }

    const info = port.getInfo?.() ?? {};
    opts.onLog(
      `Monitoring serial port${
        info.usbVendorId ? ` (VID 0x${info.usbVendorId.toString(16)}, PID 0x${(info.usbProductId ?? 0).toString(16)})` : ''
      }. Waiting for device output…`
    );

    this.running = true;
    // stream:true keeps multi-byte UTF-8 (Chinese logs) intact across chunk cuts.
    const decoder = new TextDecoder('utf-8');
    void this.readLoop(opts, decoder);
  }

  private async readLoop(opts: MonitorOpts, decoder: TextDecoder): Promise<void> {
    const port = this.port;
    if (!port) return;
    while (this.running && port.readable) {
      const reader = port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length) opts.onData(decoder.decode(value, { stream: true }));
        }
      } catch {
        // Read aborted via stop(), or the device was unplugged.
      } finally {
        reader.releaseLock();
        this.reader = null;
      }
      if (this.running) opts.onClose();
      break;
    }
    // Flush any tail bytes held by the streaming decoder.
    const tail = decoder.decode();
    if (tail) opts.onData(tail);
  }

  /** Stop pumping and release the OS-level port. Safe to call anytime. */
  async stop(): Promise<void> {
    this.running = false;
    try {
      await this.reader?.cancel();
    } catch {
      /* ignore */
    }
    const port = this.port;
    this.port = null;
    if (port) {
      try {
        await port.close();
      } catch {
        /* already closing / closed */
      }
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
