# Sightline: ONNX Runtime C library for iOS, taken from Microsoft's NuGet package.
#
# Why this file exists: the CocoaPods trunk spec for onnxruntime-c downloads
# https://download.onnxruntime.ai/pod-archive-onnxruntime-c-<version>.zip, and
# that host stopped serving the archives around 2026-11-20 (wrong TLS
# certificate, and 404 behind it). Every `pod install` that needs the pod fails.
#
# Microsoft.ML.OnnxRuntime 1.18.0 on nuget.org is Microsoft's own package of the
# same release and carries the same iOS xcframework (device and simulator
# slices). The sha256 below pins the exact file; its SHA-512 was checked against
# the hash nuget.org publishes for the package on 2026-11-25.
#
# The sherpa-onnx static library vendored in the Bluetooth SDK needs these
# symbols at link time. Nothing in the app calls ONNX Runtime directly.
#
# Remove this file, and its `extraPods` entry in app.config.ts, once upstream
# has its own fix or the trunk pod downloads again.
Pod::Spec.new do |s|
  s.name = 'onnxruntime-c'
  s.version = '1.18.0'
  s.summary = 'ONNX Runtime C/C++ Pod'
  s.description = 'A pod for the ONNX Runtime C/C++ library, sourced from the Microsoft.ML.OnnxRuntime NuGet package.'
  s.homepage = 'https://github.com/microsoft/onnxruntime'
  s.license = { type: 'MIT', file: 'LICENSE' }
  s.authors = { 'ONNX Runtime' => 'onnxruntime@microsoft.com' }
  s.platform = :ios, '12.0'
  s.source = {
    http: 'https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime/1.18.0/microsoft.ml.onnxruntime.1.18.0.nupkg',
    type: :zip,
    sha256: '441222724d068248dd8c20925b33ed9ac3cc68570a7bb56e3e57b6871f7aa1c9',
  }
  s.vendored_frameworks = 'runtimes/ios/native/onnxruntime.xcframework'
  s.static_framework = true
  s.weak_frameworks = 'CoreML'
  s.preserve_paths = 'LICENSE'
  s.libraries = 'c++'
  s.pod_target_xcconfig = {
    'OTHER_CPLUSPLUSFLAGS' => '-fvisibility=hidden -fvisibility-inlines-hidden',
  }
end
