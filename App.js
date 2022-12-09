import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  AsyncStorage,
  BackHandler,
  Button,
  Dimensions,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import WebView from 'react-native-webview';
import {
  BLEPrinter,
  NetPrinter,
  USBPrinter,
  IUSBPrinter,
  IBLEPrinter,
  INetPrinter,
  ColumnAliment,
  COMMANDS,
} from 'react-native-thermal-receipt-printer-image-qr';
import {parse} from '@babel/core';

const App = () => {
  const BOLD_ON = COMMANDS.TEXT_FORMAT.TXT_BOLD_ON;
  const BOLD_OFF = COMMANDS.TEXT_FORMAT.TXT_BOLD_OFF;
  const CENTER = COMMANDS.TEXT_FORMAT.TXT_ALIGN_CT;
  const webRef = useRef();
  const [canGoBack, setCanGoBack] = useState();
  const [printers, setPrinters] = useState(null);
  const [currentPrinter, setCurrentPrinter] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadPrinter, setLoadPrinter] = useState(false);
  const [printerError, setPrinterError] = useState(false);
  const [savedPrinter, setSavedPrinter] = useState(null);
  const [bluetoothError, setBluetoothError] = useState(false);
  const [printData, setPrintData] = useState([
    '<D>ayat store</D>',
    'Telp: -',
    // 'Nota: kd_trx478',
    // 'Kasir: Disza',
    // 'Tgl: 2022-12-02 19:11:52',
    // ' ',
    // {type: 'header', items: ['Item', 'Qty', 'Harga', 'Total']},
    // '-'.repeat(32),
    // {type: 'content', items: ['SISTA', '10', '5.000,00', '5.000,00']},
    // {type: 'content', items: ['SISTA8', '1', '5.000,00', '5.000,00']},
    // {
    //   type: 'content',
    //   items: ['SISTA65', '1', '1.500.000,00', '1.500.000,00'],
    // },
    // {type: 'content', items: ['SISTA2', '1', '5.000,00', '5.000,00']},
    // {type: 'content', items: ['SISTA3', '1', '5.000,00', '5.000,00']},
    // '-'.repeat(32),
    // {type: 'content', items: ['Sub Total', '50.000,00']},
    // {type: 'content', items: ['Diskon', '0,00']},
    // {type: 'content', items: ['PPN', '0,00']},
    // {type: 'content', items: ['Grand Total', '5.000,00']},
    // {type: 'content', items: ['BAYAR', '6.000,00']},
    // {type: 'content', items: ['KEMBALI', '0,00']},
    // '-'.repeat(32),
    // `${CENTER}Terima kasih atas kunjungan anda`,
    // '-'.repeat(32),
    // '\n\n',
  ]);

  /**
   * Handle back ketika tombol back yg ada di device diclick
   */
  const handleBack = useCallback(() => {
    if (canGoBack && webRef.current) {
      webRef.current.goBack();
      return true;
    }
    return false;
  }, [canGoBack]);

  useEffect(() => {
    Dimensions.addEventListener('change', () => {
      console.log('changed');
    });
    BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => {
      BackHandler.removeEventListener('hardwareBackPress', handleBack);
    };
  }, [handleBack]);

  /**
   * Handle data yang masuk dari web
   */

  const handleMessage = data => {
    console.log(data);
    let dataFromWeb = JSON.parse(data.nativeEvent.data);
    console.log(dataFromWeb);

    if (dataFromWeb.print) {
      setPrintData(dataFromWeb.print);
      printReceipt(dataFromWeb.print);
    }
  };

  /**
   * Handle print secara asyncronous
   */

  const asyncPrintText = (printer, text, waitTime) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          printer.printText(text);
        } catch (err) {
          console.log(err);
        }
        resolve();
      }, waitTime * 10);
    });
  };

  const asyncPrintBill = (printer, bill, waitTime) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        printer.printBill(bill);
        resolve();
      }, waitTime * 3);
    });
  };

  const asyncPrintColumnsText = (
    printer,
    columnHeader,
    columnWidth,
    columnAliment,
    columnStyle,
    waitTime,
  ) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        printer.printColumnsText(
          columnHeader,
          columnWidth,
          columnAliment,
          columnStyle,
        );
        resolve();
      }, waitTime * 10);
    });
  };

  /**
   * Handle print
   */

  const printReceipt = async (print, forced = false, printer = false) => {
    if (print) {
      printer = printer ? printer : savedPrinter;
      const isValid = forced ? forced : await connectPrinter(savedPrinter);
      console.log(printer, isValid, 'haha');
      if (isValid && printer) {
        setPrinterError(false);
        console.log('printing', savedPrinter);
        let waitTime = 1;
        console.log(print);
        for (let item of print) {
          console.log(item);
          if (typeof item !== 'string') {
            let columnAliment = [];
            let columnWidth = [];
            if (item.items.length > 2) {
              columnAliment.push(ColumnAliment.LEFT);
              columnAliment.push(ColumnAliment.RIGHT);
              columnAliment.push(ColumnAliment.RIGHT);
              columnWidth.push(10);
              columnWidth.push(10);
              columnWidth.push(10);
            } else {
              columnAliment.push(ColumnAliment.LEFT);
              columnAliment.push(ColumnAliment.RIGHT);
              columnWidth.push(15);
              columnWidth.push(15);
            }
            await asyncPrintColumnsText(
              BLEPrinter,
              item.items,
              columnWidth,
              columnAliment,
              ['', '', ''],
              waitTime++,
            );
          } else {
            await asyncPrintText(BLEPrinter, item, waitTime++);
          }
        }
        await asyncPrintText(BLEPrinter, '\n\n', waitTime++);
        setPrintData([]);
      } else {
        setPrinterError(true);
      }
    }
  };

  /**
   * Handle validasi printer
   * - apakah device ada
   * - apakah printer yang disave ada
   */

  const getPrinters = async (isReturn = false) => {
    setLoading(true);
    setBluetoothError(false);
    let devices = await USBPrinter.init()
      .then(() => {
        //list printers
        return USBPrinter.getDeviceList()
          .then(data => {
            return data;
            // _setPrinters(data);
          })
          .catch(err => {
            // setPrinterError(true);
          });
      })
      .catch(err => {
        setPrinterError(true);
        console.log(err);
      });
    if (!devices) {
      devices = await BLEPrinter.init()
        .then(() => {
          //list printers
          return BLEPrinter.getDeviceList()
            .then(data => {
              return data;
              // console.log(printersData);
              // _setPrinters(data);
            })
            .catch(err => {
              // setPrinterError(true);
            });
        })
        .catch(err => {
          setPrinterError(true);
          setBluetoothError(true);
          setLoading(false);
          // Alert.alert('Error', 'Bluetooth belum dinyalakan!');
        });
    }
    if (devices) _setPrinters(devices);
    if (isReturn) return devices;
  };

  const getPrinter = async () => {
    try {
      const printer = await AsyncStorage.getItem('printer');
      console.log(printer, 'getPrinter');
      if (printer) {
        const parsed = JSON.parse(printer);
        savePrinter(parsed);
        setSavedPrinter(parsed);
        setCurrentPrinter(parsed);
      }
    } catch (err) {
      console.log(err, '??');
    }
  };

  const _setPrinters = data => {
    setLoading(false);
    setPrinters(data);
  };

  // useEffect(() => {
  //   if (printers) {
  //     printerValidation();
  //   }
  // }, [printers]);

  useEffect(() => {
    if (printerError) {
      setSavedPrinter(null);
      setCurrentPrinter(null);
    }
  }, [printerError]);

  const savePrinter = async printer => {
    try {
      await AsyncStorage.setItem('printer', JSON.stringify(printer));
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    getPrinters();
    getPrinter();
  }, []);

  // useEffect(() => {
  //   console.log(savedPrinter);
  //   if (savedPrinter) savePrinter();
  // }, [savedPrinter]);

  const connectPrinter = async (printer, isPrint = false) => {
    let result = false;
    if (printer) {
      await BLEPrinter.closeConn();
      if (printer.inner_mac_address) {
        console.log('conenctPrinter', printer.inner_mac_address);
        result = await BLEPrinter.connectPrinter(
          printer.inner_mac_address,
        ).then(
          res => {
            console.log(res, 'BB');
            setPrinterError(false);
            setSavedPrinter(printer);
            setCurrentPrinter(printer);
            savePrinter(printer);
            if (isPrint) printReceipt(printData, true, printer);
            return true;
          },
          err => {
            console.log(err, 'AA');
            Alert.alert('Error', 'Tidak dapat terhubung ke printer!');
            return false;
          },
        );
      } else {
        result = await USBPrinter.connectPrinter(
          printer.vendorID,
          printer.productId,
        );
      }
      // if (result && isPrint) {
      //   printReceipt();
      // }
    }
    setLoadPrinter(false);
    return result;
  };

  // useEffect(() => {
  //   console.log(currentPrinter, 'WOY');
  //   connectPrinter();
  // }, [currentPrinter]);

  return (
    <SafeAreaView style={{flex: 1}}>
      {/* <ScrollView style={{width: '100%'}} contentContainerStyle={{flexGrow: 1}}>
        <WebView
          nestedScrollEnabled
          ref={webRef}
          onMessage={handleMessage}
          source={{uri: 'https://customer.prahwa.com/'}}
          onLoadProgress={event => setCanGoBack(event.nativeEvent.canGoBack)}
          setSupportMultipleWindows={false}
        />
      </ScrollView> */}
      <Modal transparent visible={printerError}>
        <View
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <View
            style={{
              backgroundColor: 'white',
              width: '85%',
              minHeight: '30%',
              padding: 10,
            }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
              <Text style={{fontWeight: 'bold'}}>Printer belum terpilih!</Text>
              <TouchableOpacity
                style={{paddingHorizontal: 8}}
                onPress={() => setPrinterError(false)}>
                <Text style={{fontWeight: 'bold', fontSize: 18}}>x</Text>
              </TouchableOpacity>
            </View>
            <View style={{marginVertical: 8}}>
              <Text>
                Pilih daftar perangkat yang terdaftar di bawah ini dan
                <Text style={{fontWeight: '500'}}>
                  {' '}
                  pastikan hp/tablet dan printer terhubung menggunakan
                  bluetooth/usb
                </Text>
                .
              </Text>
              {loadPrinter ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <ActivityIndicator
                    style={{marginVertical: 10}}
                    size="large"
                  />
                  <Text>Menghubungkan</Text>
                </View>
              ) : (
                <>
                  <View
                    style={{
                      marginTop: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-around',
                    }}>
                    <Text>Tipe</Text>
                    <Text>Nama Perangkat</Text>
                  </View>
                  {bluetoothError ? (
                    <Text style={{textAlign: 'center', marginVertical: 10}}>
                      Bluetooth belum dinyalakan!
                    </Text>
                  ) : loading ? (
                    <ActivityIndicator
                      style={{marginVertical: 10}}
                      size="large"
                    />
                  ) : (
                    <FlatList
                      data={printers}
                      keyExtractor={item =>
                        item.vendorID ? item.vendorID : item.inner_mac_address
                      }
                      renderItem={({item}) => (
                        <View>
                          <TouchableOpacity
                            onPress={() => {
                              setLoadPrinter(true);
                              setTimeout(() => connectPrinter(item, true), 500);

                              // printReceipt(printData, item);
                            }}>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-around',
                                paddingVertical: 5,
                                backgroundColor: '#eaeaea',
                                marginBottom: 5,
                              }}>
                              <Text>{item.vendorID ? 'USB' : 'Bluetooth'}</Text>
                              <Text>{item.device_name}</Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      )}
                    />
                  )}
                  <TouchableOpacity
                    onPress={() => getPrinters()}
                    style={{
                      backgroundColor: 'lightblue',
                      justifyContent: 'center',
                      alignItems: 'center',
                      paddingVertical: 5,
                      marginHorizontal: '30%',
                      marginTop: 10,
                    }}>
                    <Text style={{color: 'gray'}}>Refresh</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
      <Button
        title="print smth"
        onPress={() => {
          // getPrinters();
          printReceipt(printData);
        }}
      />
    </SafeAreaView>
  );
};

export default App;
