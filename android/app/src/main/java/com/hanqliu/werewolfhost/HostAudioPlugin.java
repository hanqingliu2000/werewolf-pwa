package com.hanqliu.werewolfhost;

import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;

@CapacitorPlugin(name = "HostAudio")
public class HostAudioPlugin extends Plugin {
    private MediaPlayer currentPlayer;

    @PluginMethod
    public void play(PluginCall call) {
        String key = call.getString("key", "");
        if (!key.matches("[a-z0-9_]+")) {
            call.reject("INVALID_AUDIO_KEY");
            return;
        }

        getActivity().runOnUiThread(() -> playOnUiThread(key, call));
    }

    private void playOnUiThread(String key, PluginCall call) {
        releaseCurrentPlayer();

        String assetPath = "public/audio/host/" + key + ".mp3";
        try {
            AssetFileDescriptor afd = getContext().getAssets().openFd(assetPath);
            MediaPlayer player = new MediaPlayer();
            currentPlayer = player;

            player.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            );
            player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();

            player.setOnCompletionListener(donePlayer -> {
                releaseCurrentPlayer();
                JSObject ret = new JSObject();
                ret.put("key", key);
                call.resolve(ret);
            });
            player.setOnErrorListener((errorPlayer, what, extra) -> {
                releaseCurrentPlayer();
                call.reject("NATIVE_AUDIO_PLAY_FAILED");
                return true;
            });
            player.prepare();
            player.start();
        } catch (IOException | RuntimeException e) {
            releaseCurrentPlayer();
            call.reject("NATIVE_AUDIO_MISSING");
        }
    }

    private void releaseCurrentPlayer() {
        if (currentPlayer == null) return;
        try {
            currentPlayer.setOnCompletionListener(null);
            currentPlayer.setOnErrorListener(null);
            if (currentPlayer.isPlaying()) {
                currentPlayer.stop();
            }
        } catch (IllegalStateException ignored) {
            // The player may already be completed or failed; release is still safe.
        } finally {
            currentPlayer.release();
            currentPlayer = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        releaseCurrentPlayer();
        super.handleOnDestroy();
    }
}
