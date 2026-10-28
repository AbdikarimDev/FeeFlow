// Installs the bundled Kotlin USSD native module into a *fresh* Expo prebuild.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');
const NS = 'com.feeflow.app';
module.exports = function withUssdNative(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest['uses-permission'] ||= [];
    for (const name of ['android.permission.CALL_PHONE','android.permission.READ_PHONE_STATE']) {
      if (!manifest['uses-permission'].some(x => x.$?.['android:name'] === name)) manifest['uses-permission'].push({ $: {'android:name': name} });
    }
    const application = manifest.application[0];
    application.service ||= [];
    if (!application.service.some(s => s.$?.['android:name'] === `${NS}.ussd.UssdAccessibilityService`)) {
      application.service.push({
        $: {'android:name': `${NS}.ussd.UssdAccessibilityService`, 'android:permission':'android.permission.BIND_ACCESSIBILITY_SERVICE', 'android:exported':'true'},
        'intent-filter': [{ action: [{ $: {'android:name': 'android.accessibilityservice.AccessibilityService'}}]}],
        'meta-data': [{ $: {'android:name':'android.accessibilityservice','android:resource':'@xml/ussd_accessibility_service'}}]
      });
    }
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const root = mod.modRequest.platformProjectRoot;
    const dest = path.join(root, 'app/src/main/java/com/feeflow/app/ussd');
    fs.mkdirSync(dest, {recursive:true});
    for (const name of ['UssdBridgeModule.kt','UssdAccessibilityService.kt','UssdBridgePackage.kt']) {
      fs.copyFileSync(path.join(__dirname,'../native/ussd',name), path.join(dest,name));
    }
    const xmlDir = path.join(root,'app/src/main/res/xml');
    fs.mkdirSync(xmlDir, {recursive:true});
    fs.copyFileSync(path.join(__dirname,'../native/ussd/ussd_accessibility_service.xml'), path.join(xmlDir,'ussd_accessibility_service.xml'));
    const appKt = path.join(root,'app/src/main/java/com/feeflow/app/MainApplication.kt');
    if (!fs.existsSync(appKt)) throw new Error('Expo MainApplication.kt not found at '+appKt);
    let main = fs.readFileSync(appKt,'utf8');
    if (!main.includes('import com.feeflow.app.ussd.UssdBridgePackage')) {
      main = main.replace(/(package\s+com\.feeflow\.app\s*)/, '$1\nimport com.feeflow.app.ussd.UssdBridgePackage\n');
    }
    if (!main.includes('add(UssdBridgePackage())')) {
      const pattern = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!pattern.test(main)) throw new Error('MainApplication package list layout changed; manually add UssdBridgePackage()');
      main = main.replace(pattern, match => match + '\n              add(UssdBridgePackage())');
    }
    fs.writeFileSync(appKt,main);
    return mod;
  }]);
};
