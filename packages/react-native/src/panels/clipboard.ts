import { Share } from 'react-native';

/**
 * Put a value somewhere the developer can paste it.
 *
 * Uses React Native's own Share, and nothing else. An earlier version reached
 * for @react-native-clipboard/clipboard when installed, which was wrong twice
 * over: requiring an absent optional peer throws uncaught under Metro, and the
 * NativeModules gate added to prevent that reports null for every module under
 * the New Architecture — so the clipboard branch never ran even when the
 * package was present, and the code only appeared to work because it always
 * fell through to here.
 *
 * Share costs a sheet and an extra tap. It also needs nothing installed, works
 * in every app, and cannot crash one. For a debug overlay that is the right
 * trade; a host wanting a one-tap copy can wrap Loupe's value itself.
 */
export async function copyValue(text: string): Promise<void> {
  try {
    await Share.share({ message: text });
  } catch {
    // Dismissing the sheet rejects on some platforms, and a failed copy must
    // never surface as a crash inside a debugging tool.
  }
}
