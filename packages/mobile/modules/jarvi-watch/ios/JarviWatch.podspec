Pod::Spec.new do |s|
  s.name           = 'JarviWatch'
  s.version        = '1.0.0'
  s.summary        = 'Hands the Jarvi session to the Apple Watch app'
  s.description    = 'Sends the signed-in session to the Jarvi watchOS app over WatchConnectivity.'
  s.author         = 'Jarvi'
  s.homepage       = 'https://github.com/pixeldoug/jarvi'
  s.license        = { type: 'UNLICENSED' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WatchConnectivity'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
