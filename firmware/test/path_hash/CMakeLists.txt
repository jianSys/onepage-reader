add_executable(TxtPathHashTest
  TxtPathHashTest.cpp
)

target_include_directories(TxtPathHashTest PRIVATE
  ${REPO_ROOT}/lib/Txt
)

target_link_libraries(TxtPathHashTest PRIVATE
  crosspoint_test_common
  GTest::gtest_main
)

gtest_discover_tests(TxtPathHashTest)
