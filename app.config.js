export default {
  "expo": {
    "owner": "tephl",
    "name": "agapai-mobile",
    "slug": "agapai-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./src/assets/icons/logo.png", 
    "scheme": "agap_ai",
    "userInterfaceStyle": "automatic",
    "ios": {
      "icon": "./assets/peak.png"
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#ffffff",
        "foregroundImage": "./src/assets/icons/logo.png", 
        "backgroundImage": "./assets/images/android-icon-background.png",
        "monochromeImage": "./src/assets/icons/logo.png", 
      },
      "predictiveBackGestureEnabled": false,
      "package": "com.tephl.agap_ai",
      "usesCleartextTraffic": true
    },
    "web": {
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      "@maplibre/maplibre-react-native", 
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Allow agap.ai to use your location."
        }
      ], 
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#ffffff",
          "image": "./src/assets/icons/logo.png", 
          "imageWidth": 76
        }
      ],
      "expo-secure-store",
      [
        "expo-camera",
        {
          "cameraPermission": "Allow agap.ai to access your camera to attach a photo to your report.",
          "microphonePermission": false,
          "recordAudioAndroid": false
        }
      ],
      "expo-sqlite"
    ],
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    },
    "extra": {
      "eas": {
        "projectId": "66eacbac-6bfd-4f73-880f-84f8c9b2567a"
      }
    }
  }
}
