package com.hanqliu.werewolfhost;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HostAudioPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
